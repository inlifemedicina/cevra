import type { SourceAsset } from "@cevra/project-ir";
import { useEffect, useRef, useState } from "react";
import type { DesktopBackend } from "./backend/desktop-backend";

export function thumbnailSourceKey(source: SourceAsset): string {
  return JSON.stringify([source.id, source.uri, source.technicalDescriptor?.content]);
}
type Thumbnail = { url: string; width: number; height: number; bytes: number };

/** One request at a time; late responses cannot attach to a different source/snapshot. */
export function useSourceThumbnails(sources: readonly SourceAsset[], backend: DesktopBackend | undefined, snapshotId: string | undefined, busy: boolean) {
  const cache = useRef(new Map<string, Thumbnail>());
  const finished = useRef(new Set<string>());
  const [revision, setRevision] = useState(0);
  const signature = JSON.stringify(sources.filter(source => source.kind === "video").map(thumbnailSourceKey));
  useEffect(() => {
    let active = true, operationId: string | undefined;
    const videos = sources.filter(source => source.kind === "video");
    const keys = new Set(videos.map(thumbnailSourceKey));
    for (const key of cache.current.keys()) if (!keys.has(key)) cache.current.delete(key);
    for (const key of finished.current) if (!keys.has(key)) finished.current.delete(key);
    if (busy || !backend?.thumbnailLocalVideo || !snapshotId) return;
    void (async () => {
      for (const source of videos) {
        if (!active) return;
        const key = thumbnailSourceKey(source);
        operationId = `source-thumbnail-${crypto.randomUUID()}`;
        try {
          const frame = await backend.thumbnailLocalVideo!({ sourceId: source.id, expectedSnapshotId: snapshotId, operationId });
          if (!active) return;
          if (frame.sourceId !== source.id || frame.snapshotId !== snapshotId || frame.mimeType !== "image/png" || frame.base64.length > 174_764
            || !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height) || Math.min(frame.width, frame.height) < 1 || Math.max(frame.width, frame.height) > 160) throw Error("Invalid thumbnail");
          const bytes = Uint8Array.from(atob(frame.base64), c => c.charCodeAt(0));
          if (bytes.length < 24 || bytes.length > 128 * 1024 || [137, 80, 78, 71, 13, 10, 26, 10].some((value, i) => bytes[i] !== value)) throw Error("Invalid thumbnail");
          const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          if (header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452 || header.getUint32(16) !== frame.width || header.getUint32(20) !== frame.height) throw Error("Invalid thumbnail");
          cache.current.delete(key);
          while (cache.current.size >= 128 || [...cache.current.values()].reduce((total, entry) => total + entry.bytes, 0) + bytes.length > 16 * 1024 * 1024) cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(key, { url: `data:image/png;base64,${frame.base64}`, width: frame.width, height: frame.height, bytes: bytes.length });
        } catch { if (active) cache.current.delete(key); }
        finally { if (active) { operationId = undefined; finished.current.add(key); setRevision(value => value + 1); } }
      }
    })();
    return () => {
      active = false;
      if (operationId) void backend.cancelOperation(operationId).catch(() => undefined);
    };
  }, [backend, snapshotId, signature, busy]);
  return {
    get(source: SourceAsset) { void revision; return cache.current.get(thumbnailSourceKey(source)); },
    failed(source: SourceAsset) { void revision; return finished.current.has(thumbnailSourceKey(source)) && !cache.current.has(thumbnailSourceKey(source)); },
    reject(source: SourceAsset) { const key = thumbnailSourceKey(source); cache.current.delete(key); finished.current.add(key); setRevision(value => value + 1); }
  };
}
