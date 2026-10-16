import { resolveProjectManualTitle, manualVideoError, type LocalVideoPreview, type LocalVideoPreviewRequest } from "@cevra/application";
import { FixedManualTitleCompositionAdapter, type MediaEngineAdapter, type MediaPublicationEvidenceV1 } from "@cevra/contracts";
import type { ProjectHistory } from "@cevra/project-ir";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DerivedVideoPreview, resolvePreviewRange } from "./derived-video-preview.js";
import { nativeTitleFontIdentity } from "./native-title-font-identity.js";
const MAX_BYTES = 16 * 1024 * 1024, MAX_ENTRIES = 4, MAX_PNG = 2 * 1024 * 1024;
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
interface Raster {
    canonical: Buffer;
    graphic: Buffer;
    canonicalSha: string;
    graphicSha: string;
    seal: string;
}
/** Session-local derived bytes only. No source, journal, export or persistence writes. */
export class LayeredTitlePreview {
    private readonly cache = new Map<string, Raster>();
    private bytes = 0;
    private closed = false;
    constructor(private readonly options: {
        history: ProjectHistory;
        engine: MediaEngineAdapter;
        video: DerivedVideoPreview;
        settle: () => Promise<void>;
        runtimeIdentity: () => string;
        temporaryRoot?: string;
    }) { }
    close() { this.closed = true; this.cache.clear(); this.bytes = 0; }
    cacheState() { return { entries: this.cache.size, retainedBytes: this.bytes, maxBytes: MAX_BYTES, maxEntries: MAX_ENTRIES }; }
    private forget(key: string) { const old = this.cache.get(key); if (old) {
        this.bytes -= old.canonical.length + old.graphic.length + 1024;
        this.cache.delete(key);
    } }
    private remember(key: string, r: Raster) { const size = r.canonical.length + r.graphic.length + 1024; if (size > MAX_BYTES || this.closed)
        return; this.forget(key); while (this.cache.size >= MAX_ENTRIES || this.bytes + size > MAX_BYTES)
        this.forget(this.cache.keys().next().value!); this.cache.set(key, r); this.bytes += size; }
    async prepare(request: LocalVideoPreviewRequest, signal: AbortSignal): Promise<LocalVideoPreview> {
        if (this.closed)
            throw manualVideoError("OPERATION_CANCELLED");
        const start = performance.now(), history = this.options.history, journal = history.journalIdentity, range = resolvePreviewRange(history, request), title = resolveProjectManualTitle(history.current);
        if (!request.sequence || !title || title.aspect !== "16:9" || range.sources.some(s => { const v = s.technicalDescriptor?.video; return !s.width || !s.height || s.width < s.height || !v || v.colorPrimaries !== "bt709" || v.colorTransfer !== "bt709" || v.colorSpace !== "bt709" || v.colorRange !== "tv" || v.pixelFormat !== "yuv420p" || (v.rotationDegrees ?? 0) !== 0; }))
            throw manualVideoError("MANUAL_LAYER_UNAVAILABLE");
        const runtime = this.options.runtimeIdentity(), nativeFonts = nativeTitleFontIdentity();
        const revalidate = () => { signal.throwIfAborted(); if (this.closed)
            throw manualVideoError("OPERATION_CANCELLED"); resolvePreviewRange(history, request); if (history.journalIdentity !== journal || this.options.runtimeIdentity() !== runtime || nativeTitleFontIdentity() !== nativeFonts)
            throw manualVideoError("MANUAL_VIDEO_STALE"); };
        const baseStart = performance.now();
        const video = await this.options.video.prepare(request, signal, true);
        revalidate();
        const basePrepareMs = performance.now() - baseStart, base = Buffer.from(video.base64, "base64"), baseId = hash(base), baseReused = request.experimentalLayer?.knownBaseId === baseId;
        const { startFrame: _in, endFrame: _out, ...picture } = title;
        const key = hash(JSON.stringify({ runtime, nativeFonts, picture, profile: "canonical-h-bt709-cm709-srgb-lanczos-v1" }));
        const graphicStart = performance.now();
        let raster = this.cache.get(key), graphicCacheHit = false;
        if (raster) {
            if (raster.canonical.length > MAX_PNG || raster.graphic.length > MAX_PNG || raster.seal !== hash(Buffer.concat([Buffer.from(key), raster.canonical, raster.graphic]))) {
                this.forget(key);
                raster = undefined;
            }
            else {
                graphicCacheHit = true;
                this.cache.delete(key);
                this.cache.set(key, raster);
            }
        }
        if (!raster) {
            const root = await mkdtemp(join(await realpath(this.options.temporaryRoot ?? tmpdir()), "cevra-title-preview-"));
            await chmod(root, 0o700);
            const owned = await lstat(root);
            let primary: unknown;
            let candidate: Raster | undefined;
            try {
                const baseUri = join(root, "base.mp4"), canonicalUri = join(root, "canonical.png"), previewUri = join(root, "graphic.png");
                await writeFile(baseUri, base, { flag: "wx", mode: 0o600 });
                revalidate();
                const result = await this.options.engine.execute({ type: "render-manual-title-preview", version: 1, composition: new FixedManualTitleCompositionAdapter().compile(title), baseUri, baseContent: { sha256: baseId, sizeBytes: base.length }, canonicalUri, previewUri, ownedWorkspaceUri: root }, { jobId: `preview-title:${request.operationId}`, locale: "en-US", signal });
                revalidate();
                if (result.type !== "manual-title-preview" || result.canonicalUri !== canonicalUri || result.previewUri !== previewUri || result.colourProfile !== "kCGColorSpaceCoreMedia709")
                    throw manualVideoError("MANUAL_LAYER_UNAVAILABLE");
                const canonical = await readPng(canonicalUri, result.publications.canonical, result.canonicalSha256, 1920, 1080, signal), graphic = await readPng(previewUri, result.publications.preview, result.previewSha256, 720, 404, signal);
                revalidate();
                candidate = { canonical, graphic, canonicalSha: result.canonicalSha256, graphicSha: result.previewSha256, seal: hash(Buffer.concat([Buffer.from(key), canonical, graphic])) };
            }
            catch (e) {
                primary = e;
                throw e;
            }
            finally {
                try {
                    await this.options.settle();
                    const current = await lstat(root);
                    if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== owned.dev || current.ino !== owned.ino)
                        throw manualVideoError("MANUAL_VIDEO_CLEANUP_FAILED");
                    await rm(root, { recursive: true, force: true });
                }
                catch (e) {
                    if (!primary)
                        throw e;
                    Object.assign(primary instanceof Error ? primary : {}, { cleanupError: e });
                }
            }
            revalidate();
            raster = candidate!;
            this.remember(key, raster);
        }
        revalidate();
        const { initialFrame: _frame, ...packet } = video;
        return { ...packet, base64: baseReused ? "" : packet.base64, layered: { version: 1, baseId, baseReused, graphicId: key, title: structuredClone(title), canonical: { mimeType: "image/png", width: 1920, height: 1080, base64: raster.canonical.toString("base64"), sha256: raster.canonicalSha }, graphic: { mimeType: "image/png", width: 720, height: 404, base64: raster.graphic.toString("base64"), sha256: raster.graphicSha }, timings: { hostTotalMs: performance.now() - start, basePrepareMs, graphicPrepareMs: performance.now() - graphicStart, graphicCacheHit } } };
    }
}
async function readPng(file: string, publication: MediaPublicationEvidenceV1, digest: string, width: number, height: number, signal: AbortSignal) {
    const h = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const first = await h.stat({ bigint: true });
        if (!first.isFile() || first.size < 24n || first.size > BigInt(MAX_PNG) || String(first.dev) !== publication.device || String(first.ino) !== publication.inode)
            throw manualVideoError("MANUAL_LAYER_UNAVAILABLE");
        const bytes = Buffer.alloc(Number(first.size));
        for (let offset = 0; offset < bytes.length;) {
            signal.throwIfAborted();
            const read = await h.read(bytes, offset, bytes.length - offset, offset);
            if (!read.bytesRead)
                throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
            offset += read.bytesRead;
        }
        const last = await h.stat({ bigint: true }), named = await lstat(file, { bigint: true });
        for (const stamp of [last, named])
            if (!stamp.isFile() || stamp.dev !== first.dev || stamp.ino !== first.ino || stamp.size !== first.size || stamp.mtimeNs !== first.mtimeNs || stamp.ctimeNs !== first.ctimeNs)
                throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
        if (hash(bytes) !== digest || !bytes.subarray(0, 16).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])) || bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height)
            throw manualVideoError("MANUAL_LAYER_UNAVAILABLE");
        return bytes;
    }
    finally {
        await h.close();
    }
}
