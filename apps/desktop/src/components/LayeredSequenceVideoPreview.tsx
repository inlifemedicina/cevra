import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { validateManualTitle } from "@cevra/project-ir";
import type { LocalVideoPreview, LayerPreviewFallbackV1, LayerPreviewPlaybackV1 } from "@cevra/application";
import { ManualVideoPreview } from "./ManualVideoPreview";
import { ManualTitleOverlay } from "./ManualTitleOverlay";
import { cfr30DecoderSeekSeconds, floorMsToFrames, framesToMilliseconds } from "../frame-timing";
import { formatPreciseTime } from "../ui-model";
import { gestureEscape } from "../timeline-interactions";
import { activateShortcut, shortcutAction, shortcutProps } from "../keyboard-shortcuts";
type Props = ComponentProps<typeof ManualVideoPreview>;
type Packet = LocalVideoPreview & {
    layered: NonNullable<LocalVideoPreview["layered"]>;
};
type Images = {
    key: string;
    canonical: ImageBitmap;
    graphic: ImageBitmap;
    canonicalSha: string;
    graphicSha: string;
};
type PlaybackScope = {
    operationId: string; snapshot: string; epoch: number; start: number;
    callbacks: number; scheduled: boolean; lastCallbackAt: number | null; lastMediaTimeMs: number | null;
    submitted: number; failed: number; lastDrawAt: number | null;
};
export type LayerPreviewTiming=import("@cevra/application").LayerPreviewPresentationV1;
class AdmissionError extends Error {
    constructor(readonly reason: LayerPreviewFallbackV1["reason"]) { super(reason); }
}
const nativeCodes: readonly NonNullable<LayerPreviewFallbackV1["nativeCode"]>[] = ["MANUAL_LAYER_UNAVAILABLE", "MANUAL_VIDEO_UNAVAILABLE", "MANUAL_VIDEO_UNSUPPORTED", "MANUAL_VIDEO_SOURCE_CHANGED", "MANUAL_VIDEO_STALE", "MANUAL_VIDEO_PREVIEW_TIMEOUT", "MANUAL_VIDEO_TITLE_COLOUR_UNSUPPORTED", "OPERATION_CANCELLED", "PROJECT_MUTATION_BUSY", "HOST_INVALID_PARAMS", "HOST_UNAVAILABLE", "HOST_OPERATION_FAILED"];
const timings: LayerPreviewTiming[] = [];
/** Local bounded diagnostics; no project, path, title text or external telemetry. */
export function layerPreviewTimings() { return timings.map(t => structuredClone(t)); }
function record(t: LayerPreviewTiming) { timings.push(t); if (timings.length > 100)
    timings.shift(); window.dispatchEvent(new CustomEvent("cevra:layer-preview-timing", { detail: t })); }
async function digest(bytes: Blob | Uint8Array) { const data = bytes instanceof Blob ? await bytes.arrayBuffer() : bytes; return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), v => v.toString(16).padStart(2, "0")).join(""); }
const release = (images: Images | null) => { images?.canonical.close(); images?.graphic.close(); };
function sameTitle(a: unknown, b: unknown) { const encode = (v: unknown) => { const t = validateManualTitle(v); return JSON.stringify([t.version, t.componentId, t.text, t.startFrame, t.endFrame, t.aspect, t.version === 2 ? t.layout.x : null, t.version === 2 ? t.layout.y : null, t.version === 2 ? t.layout.width : null, t.version === 2 ? t.layout.fontScale : null]); }; return encode(a) === encode(b); }
const pixels = (base64: string, max: number) => { if (base64.length > Math.ceil(max / 3) * 4)
    throw new AdmissionError("oversize"); const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); if (!bytes.length || bytes.length > max)
    throw new AdmissionError("oversize"); return bytes; };
function png(value: Packet["layered"]["graphic"] | Packet["layered"]["canonical"], width: number, height: number) {
    const bytes = pixels(value.base64, 2 * 1024 * 1024), view = new DataView(bytes.buffer);
    if (value.mimeType !== "image/png" || value.width !== width || value.height !== height || bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452 || view.getUint32(16) !== width || view.getUint32(20) !== height || !/^[a-f0-9]{64}$/.test(value.sha256))
        throw new AdmissionError("png-invalid");
    return new Blob([bytes], { type: "image/png" });
}
async function waitMedia(video: HTMLVideoElement, event: string, signal: AbortSignal) {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => { const done = (e?: unknown) => { clearTimeout(timer); video.removeEventListener(event, ok); video.removeEventListener("error", error); signal.removeEventListener("abort", abort); e ? reject(e) : resolve(); }; const ok = () => done(), error = () => done(new AdmissionError("decode-error")), abort = () => done(Error("aborted")); const timer = setTimeout(() => done(new AdmissionError("decode-timeout")), 15000); video.addEventListener(event, ok, { once: true }); video.addEventListener("error", error, { once: true }); signal.addEventListener("abort", abort, { once: true }); });
}
/** Candidate-only presentation over the existing sequence/History/transport. */
export function LayeredSequenceVideoPreview(props: Props) {
    const { backend, snapshotId, source, sequencePreview, seek, titleEditing, t, program, busy } = props;
    const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), base = useRef<{
        id: string;
        url: string;
    } | null>(null), images = useRef<Images | null>(null), packet = useRef<Packet | null>(null);
    const attachVideo = useCallback((element: HTMLVideoElement | null) => { const old = video.current; if (!element && old) {
        old.pause();
        old.removeAttribute("src");
        old.load();
    } video.current = element; }, []);
    const current = useRef(props);
    current.current = props;
    const modelEpoch = useRef(0), viewEpoch = useRef(0), viewAbort = useRef<AbortController | null>(null), modelAbort = useRef<AbortController | null>(null);
    const scrub = useRef<{
        pointerId: number;
        originalFrame: number;
        element: HTMLInputElement;
    } | null>(null);
    const displayedFrame = useRef(0);
    const admitted = useRef<{
        snapshot: string;
        epoch: number;
    } | null>(null), pendingSeek = useRef(false), ended = useRef(false), pendingTiming = useRef<{
        operationId: string;
        start: number;
        decodeMs: number;kind:"asset-update"|"seek";
    } | null>(null);
    const [fallback, setFallback] = useState(false), [ready, setReady] = useState(false), [playing, setPlaying] = useState(false), [frame, setFrame] = useState(0);
    const fallbackRecorded = useRef(false), requestTiming = useRef({ operationId: "layer-preview", start: performance.now() });
    const playback = useRef<PlaybackScope | null>(null), playbackRecords = useRef(0);
    function observePlayback(reason: LayerPreviewPlaybackV1["reason"], scope = playback.current) {
        const now = current.current, v = video.current;
        if (!scope || scope !== playback.current || scope.epoch !== viewEpoch.current || scope.snapshot !== now.snapshotId
            || packet.current?.snapshotId !== now.snapshotId || now.busy || fallbackRecorded.current || !v)
            return;
        const hasFrame = admitted.current?.snapshot === now.snapshotId && admitted.current?.epoch === scope.epoch;
        if (reason === "sample" && (!now.program?.resume || !hasFrame))
            return;
        // Per mounted renderer, across all seeks/snapshots: 23 samples and one
        // draw failure. Native persistence retains its separate 100-row ceiling.
        if (playbackRecords.current >= (reason === "sample" ? 23 : 24))
            return;
        const at = performance.now(), elapsedMs = at - scope.start;
        if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 3_600_000)
            return;
        const age = (value: number | null) => {
            const delta = value === null ? null : at - value;
            return delta !== null && Number.isFinite(delta) && delta >= 0 && delta <= 3_600_000 ? delta : null;
        };
        const mediaTime = (value: number) => Number.isFinite(value) && value >= 0 && value <= 604_800_000 ? value : null;
        const code = v.error?.code;
        const receipt: LayerPreviewPlaybackV1 = { version: 1, kind: "playback", reason, operationId: scope.operationId,
            snapshotId: scope.snapshot, epoch: scope.epoch, elapsedMs, intentToPlay: now.program?.resume === true,
            frame: hasFrame ? displayedFrame.current : null, pendingSeek: pendingSeek.current,
            decoder: { timeMs: mediaTime(v.currentTime * 1000), paused: v.paused, ended: v.ended, seeking: v.seeking,
                readyState: v.readyState, networkState: v.networkState, errorCode: code === 1 || code === 2 || code === 3 || code === 4 ? code : null },
            callback: { received: scope.callbacks, scheduled: scope.scheduled, lastMediaTimeMs: scope.lastMediaTimeMs, lastAgeMs: age(scope.lastCallbackAt) },
            draw: { submitted: scope.submitted, failed: scope.failed, lastAgeMs: age(scope.lastDrawAt) },
            visibility: document.visibilityState === "visible" ? "visible" : document.visibilityState === "hidden" ? "hidden" : "unknown",
            endpoint: "playback-observation" };
        playbackRecords.current++;
        try { void now.backend.recordLayerPresentation?.(receipt).catch(() => {}); } catch { /* Observation must not control playback or fallback. */ }
    }
    function fallBack(stage: LayerPreviewFallbackV1["stage"], cause: unknown, reason?: LayerPreviewFallbackV1["reason"]) {
        setFallback(true);
        if (fallbackRecorded.current) return;
        fallbackRecorded.current = true;
        const code = typeof cause === "object" && cause !== null && "code" in cause ? cause.code : null;
        const nativeCode = nativeCodes.find(value => value === code) ?? null;
        const now = current.current, timing = pendingTiming.current ?? requestTiming.current;
        const receipt: LayerPreviewFallbackV1 = { version: 1, kind: "fallback", operationId: timing.operationId,
            snapshotId: now.snapshotId, epoch: viewEpoch.current, stage,
            reason: reason ?? (cause instanceof AdmissionError ? cause.reason : "unexpected"), nativeCode,
            elapsedMs: performance.now() - timing.start, endpoint: "encoded-fallback",
            capabilities: { resizeObserver: typeof ResizeObserver === "function", videoFrameCallback: typeof video.current?.requestVideoFrameCallback === "function",
                imageBitmap: typeof createImageBitmap === "function", webCryptoDigest: typeof globalThis.crypto?.subtle?.digest === "function" } };
        try { void now.backend.recordLayerPresentation?.(receipt).catch(() => {}); } catch { /* Diagnostics cannot prevent the existing fallback. */ }
    }
    const run = (fn: () => void | Promise<void>) => { if (props.onAction)
        void props.onAction(fn).catch(() => { });
    else
        void fn(); };
    const clear = () => { admitted.current = null; setReady(false); const c = canvas.current; if (c)
        c.getContext("2d")?.clearRect(0, 0, c.width, c.height); };
    const isCurrent = (epoch: number) => epoch === viewEpoch.current && packet.current?.snapshotId === current.current.snapshotId && !fallback;
    function draw(epoch: number, requested: number) {
        const v = video.current, c = canvas.current, p = packet.current, pair = images.current, now = current.current;
        if (!isCurrent(epoch) || !v || !c || !p || !pair || pair.key !== p.layered.graphicId || v.seeking || v.readyState < 2 || pendingSeek.current || now.busy)
            return false;
        const total = p.sequence!.totalFrames;
        const f = Math.max(0, Math.min(total, requested));
        try {
            const context = c.getContext("2d");
            if (!context)
                return false;
            const box = c.getBoundingClientRect(), scale = Math.min(box.width / 720, box.height / 404);
            const backing = Math.max(720, Math.min(1920, Math.round(720 * scale * (window.devicePixelRatio || 1))));
            const h = Math.round(backing * 404 / 720);
            if (c.width !== backing || c.height !== h) {
                c.width = backing;
                c.height = h;
            }
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            context.fillStyle = "#000";
            context.fillRect(0, 0, c.width, c.height);
            if (f < total) {
                context.drawImage(v, 0, 0, c.width, c.height);
                const title = p.layered.title;
                if (f >= title.startFrame && f < title.endFrame)
                    context.drawImage(backing > 720 ? pair.canonical : pair.graphic, 0, 0, c.width, c.height);
            }
        }
        catch (error) {
            // A failed playback/resize/end draw must use the same bounded
            // fallback as an initial decode, rather than abandon its callback.
            if (isCurrent(epoch)) {
                const scope = playback.current;
                if (scope?.epoch === epoch) scope.failed++;
                observePlayback("draw-failure", scope);
                fallBack("decode", error);
            }
            return false;
        }
        const scope = playback.current;
        if (scope?.epoch === epoch) { scope.submitted++; scope.lastDrawAt = performance.now(); }
        admitted.current = { snapshot: now.snapshotId, epoch };
        displayedFrame.current = f;
        setFrame(f);
        setReady(true);
        now.onPlayheadChange(framesToMilliseconds(f));
        const timing = pendingTiming.current;
        if (timing) {
            const row:LayerPreviewTiming={version:1,kind:timing.kind,operationId:timing.operationId,snapshotId:now.snapshotId,epoch,frame:f,requestToCanvasMs:performance.now()-timing.start,uiDecodeMs:timing.decodeMs,host:timing.kind==="seek"?null:p.layered.timings,physicalPaintMs:null,endpoint:"canvas-submit",animationOpportunityMs:null,supersededBeforeOpportunity:false};
            requestAnimationFrame(()=>requestAnimationFrame(()=>{row.supersededBeforeOpportunity=!isCurrent(epoch);if(!row.supersededBeforeOpportunity)row.animationOpportunityMs=performance.now()-timing.start;record(row);void now.backend.recordLayerPresentation?.(row).catch(()=>{})}));
            pendingTiming.current = null;
        }
        return true;
    }
    async function showCurrent() {
        const v = video.current, p = packet.current, now = current.current, epoch = viewEpoch.current;
        if (!v || !p || p.snapshotId !== now.snapshotId)
            return;
        viewAbort.current?.abort();
        const control = new AbortController();
        viewAbort.current = control;
        const start = performance.now();
        try {
            const total = p.sequence!.totalFrames, target = Math.max(0, Math.min(total, floorMsToFrames(now.seek.timelineMs))), decodeFrame = Math.min(total - 1, target), time = cfr30DecoderSeekSeconds(decodeFrame, total);
            v.pause();
            pendingSeek.current = true;
            if (v.readyState < 2)
                await waitMedia(v, "loadeddata", control.signal);
            if (!Number.isFinite(v.duration) || Math.abs(v.duration * 1000 - p.durationMs) > 50 || v.videoWidth !== 720 || v.videoHeight !== 404)
                throw new AdmissionError("base-grid");
            if (Math.abs(v.currentTime - time) > 0.00001) {
                const event = waitMedia(v, "seeked", control.signal);
                v.currentTime = time;
                await event;
            }
            control.signal.throwIfAborted();
            if (!isCurrent(epoch))
                return;
            if (v.seeking || v.readyState < 2 || Math.floor(v.currentTime * 30 + 1e-5) !== decodeFrame)
                throw new AdmissionError("frame");
            pendingSeek.current = false;
            if (pendingTiming.current)
                pendingTiming.current.decodeMs += performance.now() - start;
            draw(epoch, target);
        }
        catch (e) {
            if (!control.signal.aborted && isCurrent(epoch)) {
                fallBack("decode", e);
            }
        }
    }
    function cancelScrub(restore = true) { const active = scrub.current; scrub.current = null; if (!active)
        return; if (active.element.hasPointerCapture?.(active.pointerId))
        active.element.releasePointerCapture(active.pointerId); if (restore)
        current.current.program?.onScrub?.(framesToMilliseconds(active.originalFrame), "cancel"); }
    useEffect(() => { const escape = (event: KeyboardEvent) => { if (gestureEscape(event))
        cancelScrub(); }, blur = () => cancelScrub(); window.addEventListener("keydown", escape); window.addEventListener("blur", blur); return () => { window.removeEventListener("keydown", escape); window.removeEventListener("blur", blur); cancelScrub(false); }; }, []);
    useEffect(() => { if (busy)
        cancelScrub(false); }, [busy]);
    useLayoutEffect(() => { ended.current = false; viewEpoch.current++;
        playback.current = { operationId: `playback-${crypto.randomUUID()}`, snapshot: snapshotId, epoch: viewEpoch.current,
            start: performance.now(), callbacks: 0, scheduled: false, lastCallbackAt: null, lastMediaTimeMs: null,
            submitted: 0, failed: 0, lastDrawAt: null };
        viewAbort.current?.abort(); video.current?.pause(); pendingSeek.current = true; clear(); }, [snapshotId, seek.sequence, busy]);
    useEffect(() => { if (packet.current?.snapshotId === snapshotId) {
        pendingTiming.current = {operationId:`seek-${crypto.randomUUID()}`,start:performance.now(),decodeMs:0,kind:"seek"};
        void showCurrent();
    } }, [seek.sequence, busy]);
    useEffect(() => {
        if (fallback)
            return;
        const generation = ++modelEpoch.current;
        modelAbort.current?.abort();
        const control = new AbortController();
        modelAbort.current = control;
        packet.current = null;
        pendingTiming.current = null;
        let settled = false;
        const operationId = `layer-preview-${crypto.randomUUID()}`, start = performance.now();
        requestTiming.current = { operationId, start };
        const valid = () => !control.signal.aborted && generation === modelEpoch.current && current.current.snapshotId === snapshotId;
        void (async () => {
            let created: Images | null = null;
            let stage: LayerPreviewFallbackV1["stage"] = "request";
            try {
                if (!source || !sequencePreview || !titleEditing)
                    throw new AdmissionError("unsupported");
                const result = await backend.previewLocalVideo({ sourceId: source.id, expectedSnapshotId: snapshotId, operationId, sequence: true, experimentalLayer: { version: 1, ...(base.current ? { knownBaseId: base.current.id } : {}) } });
                settled = true;
                if (!valid())
                    return;
                stage = "binding";
                const p = result as Packet, l = p.layered;
                if (result.sourceId !== source.id || result.snapshotId !== snapshotId || result.mimeType !== "video/mp4" || result.proxy?.profile !== "manual-cfr30-preview-v1" || !l || l.version !== 1 || !/^[a-f0-9]{64}$/.test(l.baseId) || !/^[a-f0-9]{64}$/.test(l.graphicId) || !sameTitle(l.title, titleEditing.title) || !result.sequence || result.sequence.timingPolicy !== "cfr30" || result.sequence.totalFrames !== props.clip?.frameTiming?.sourceEndFrame || result.durationMs !== framesToMilliseconds(result.sequence.totalFrames) || result.sequence.clipIds.length !== sequencePreview.length || result.sequence.clipIds.some((id, i) => id !== sequencePreview[i]!.id))
                    throw new AdmissionError("binding");
                stage = "base";
                if (l.baseReused) {
                    if (result.base64 !== "" || base.current?.id !== l.baseId)
                        throw new AdmissionError("base-unavailable");
                }
                else {
                    const bytes = pixels(result.base64, 8 * 1024 * 1024);
                    if (await digest(bytes) !== l.baseId || !valid())
                        throw new AdmissionError("base-identity");
                    const v = video.current!;
                    v.pause();
                    v.removeAttribute("src");
                    v.load();
                    if (base.current)
                        URL.revokeObjectURL(base.current.url);
                    const url = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
                    base.current = { id: l.baseId, url };
                    v.src = url;
                    v.load();
                }
                const decodeStart = performance.now();
                stage = "graphic";
                if (images.current?.key !== l.graphicId) {
                    const canonicalBlob = png(l.canonical, 1920, 1080), graphicBlob = png(l.graphic, 720, 404);
                    if (await digest(canonicalBlob) !== l.canonical.sha256 || await digest(graphicBlob) !== l.graphic.sha256)
                        throw new AdmissionError("graphic-identity");
                    if (!valid())
                        return;
                    const canonical = await createImageBitmap(canonicalBlob);
                    try {
                        created = { key: l.graphicId, canonical, graphic: await createImageBitmap(graphicBlob), canonicalSha: l.canonical.sha256, graphicSha: l.graphic.sha256 };
                    }
                    catch (e) {
                        canonical.close();
                        throw e;
                    }
                    if (!valid())
                        return;
                    release(images.current);
                    images.current = created;
                    created = null;
                }
                else if (images.current.canonicalSha !== l.canonical.sha256 || images.current.graphicSha !== l.graphic.sha256)
                    throw new AdmissionError("graphic-collision");
                if (!valid())
                    return;
                packet.current = { ...p, base64: "", layered: { ...l, canonical: { ...l.canonical, base64: "" }, graphic: { ...l.graphic, base64: "" } } };
                pendingTiming.current = { operationId, start, decodeMs: performance.now() - decodeStart,kind:"asset-update" };
                await showCurrent();
            }
            catch (e) {
                if (valid()) {
                    fallBack(stage, e);
                }
            }
            finally {
                release(created);
            }
        })();
        return () => { control.abort(); if (!settled)
            void backend.cancelOperation(operationId).catch(() => { }); };
    }, [backend, source?.id, snapshotId, Boolean(sequencePreview), fallback]);
    useEffect(() => () => { modelEpoch.current++; viewEpoch.current++; modelAbort.current?.abort(); viewAbort.current?.abort(); video.current?.pause(); video.current?.removeAttribute("src"); video.current?.load(); if (base.current)
        URL.revokeObjectURL(base.current.url); base.current = null; release(images.current); images.current = null; packet.current = null; }, []);
    useEffect(() => {
        const v = video.current, epoch = viewEpoch.current, baseId = base.current?.id, expectedSnapshot = snapshotId;
        if (!v || fallback || !baseId)
            return;
        if (typeof v.requestVideoFrameCallback !== "function") {
            fallBack("capability", null, "video-frame-callback-unavailable");
            return;
        }
        const scope = playback.current;
        if (!scope || scope.epoch !== epoch) return;
        let stopped = false, id = 0;
        const tick = (_now: number, metadata: VideoFrameCallbackMetadata) => { if (stopped || epoch !== viewEpoch.current || baseId !== base.current?.id || expectedSnapshot !== current.current.snapshotId)
            return;
            scope.scheduled = false; scope.callbacks++; scope.lastCallbackAt = performance.now();
            scope.lastMediaTimeMs = Number.isFinite(metadata.mediaTime) && metadata.mediaTime >= 0 && metadata.mediaTime <= 604_800 ? metadata.mediaTime * 1000 : null;
            const p = packet.current, now = current.current; if (p && now.program?.resume && !v.paused && !v.seeking && !pendingSeek.current && admitted.current?.snapshot === now.snapshotId) {
            const f = Math.min(p.sequence!.totalFrames, Math.floor(metadata.mediaTime * 30 + 1e-5));
            draw(epoch, f);
        } id = v.requestVideoFrameCallback(tick); scope.scheduled = true; };
        id = v.requestVideoFrameCallback(tick); scope.scheduled = true;
        return () => { stopped = true; scope.scheduled = false; v.cancelVideoFrameCallback(id); };
    }, [fallback, ready, snapshotId, seek.sequence]);
    useEffect(() => {
        const scope = playback.current;
        if (!scope || fallback || !ready || busy || !program?.resume || playbackRecords.current >= 23) return;
        const timer = window.setInterval(() => {
            observePlayback("sample", scope);
            if (playbackRecords.current >= 23) window.clearInterval(timer);
        }, 1000);
        return () => window.clearInterval(timer);
    }, [fallback, ready, busy, program?.resume, snapshotId, seek.sequence]);
    useEffect(() => { if (!fallback)
        return; viewAbort.current?.abort(); modelAbort.current?.abort(); release(images.current); images.current = null; if (base.current)
        URL.revokeObjectURL(base.current.url); base.current = null; packet.current = null; }, [fallback]);
    useEffect(() => {
        const picture = canvas.current;
        if (fallback || !picture)
            return;
        if (typeof ResizeObserver !== "function") {
            fallBack("capability", null, "resize-observer-unavailable");
            return;
        }
        const observer = new ResizeObserver(() => { if (admitted.current?.epoch === viewEpoch.current)
            draw(viewEpoch.current, displayedFrame.current); });
        observer.observe(picture);
        return () => observer.disconnect();
    }, [fallback]);
    useEffect(() => { const v = video.current, epoch = viewEpoch.current, id = base.current?.id; let active = true; if (!program?.resume) {
        v?.pause();
        return;
    } if (ready && !pendingSeek.current && !busy && admitted.current?.epoch === epoch)
        void v?.play().catch(() => { if (active && epoch === viewEpoch.current && id === base.current?.id && current.current.program?.resume && !current.current.busy) {
            fallBack("play", null, "play-rejected");
        } }); return () => { active = false; }; }, [program?.resume, ready, busy, seek.sequence, snapshotId]);
    if (fallback)
        return <><p className="manual-preview-hint" role="status">{t("preview.layerFallback")}</p><ManualVideoPreview {...props}/></>;
    const coherent = ready && admitted.current?.snapshot === snapshotId && admitted.current?.epoch === viewEpoch.current && !busy;
    const total = props.clip?.frameTiming?.sourceEndFrame ?? 0;
    const controlBusy=props.actionBusy??busy;
    const go = (f: number) => run(() => { ended.current = false; current.current.program?.onSeek(framesToMilliseconds(Math.max(0, Math.min(total, f)))); });
    return <section className="manual-video-preview" aria-label={t("preview.localVideo")} tabIndex={0} onKeyDown={event => { const action = shortcutAction(event, "preview"); if (!action)
        return; if (action === "start" || action === "end") {
        if (!coherent || busy)
            return;
        event.preventDefault();
        event.stopPropagation();
        go(action === "start" ? 0 : total);
        return;
    } activateShortcut(event, event.currentTarget, action); }}>
  <div className="manual-preview-heading"><strong>{props.sourceFileName ?? source?.displayName}</strong><span>{t("preview.layerExperimental")}</span></div>
  <div className="manual-video-stage layered-video-stage" aria-busy={!coherent}>
   <video ref={attachVideo} className="layered-decoder" preload="auto" playsInline muted={false} onError={() => { if (packet.current) {
        fallBack("decode", null, "decode-error");
    } }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={event => { const now = current.current, p = packet.current;
        if (event.currentTarget !== video.current || !event.currentTarget.ended || !now.program?.resume || now.busy || ended.current
            || admitted.current?.snapshot !== now.snapshotId || admitted.current?.epoch !== viewEpoch.current || !p
            || !draw(viewEpoch.current, p.sequence!.totalFrames)) return;
        setPlaying(false);
        ended.current = true;
        now.program.onClipEnd();
    }}/>
   <canvas ref={canvas} width={720} height={404} className="layered-picture" hidden={!coherent} data-snapshot={coherent ? snapshotId : undefined} data-frame={coherent ? frame : undefined} data-ready={coherent ? "true" : "false"}/>
   {!coherent && <p role="status">{t("preview.layerLoading")}</p>}
   {titleEditing && <ManualTitleOverlay editing={titleEditing} videoRef={video} t={t} blocked={busy || props.titleEditingBlocked === true} active={coherent && !playing && !program?.resume && frame >= titleEditing.title.startFrame && frame < titleEditing.title.endFrame}/>}
  </div>
  <div className="manual-preview-controls" onPointerDownCapture={event => { if ((event.target as Element).closest("button") && document.activeElement?.classList.contains("title-text-input"))
        event.preventDefault(); }}>
   <button {...shortcutProps("play", t)} type="button" className="secondary-button" disabled={controlBusy || !coherent} onClick={() => run(() => { const p = current.current.program; if (!p)
        return; if (p.resume) {
        p.onPlaybackIntent(false);
        video.current?.pause();
    }
    else if (frame >= total)
        p.onSeek(0, true);
    else
        p.onPlaybackIntent(true); })}>{t(program?.resume ? "preview.pauseLocal" : "preview.playLocal")}</button>
   <button {...shortcutProps("previous-frame", t)} type="button" className="secondary-button" disabled={!coherent || busy || props.actionBusy || frame === 0} onClick={() => go(frame - 1)}>{t("preview.previousFrame")}</button>
   <button {...shortcutProps("next-frame", t)} type="button" className="secondary-button" disabled={!coherent || busy || props.actionBusy || frame === total} onClick={() => go(frame + 1)}>{t("preview.nextFrame")}</button>
   <input type="range" aria-label={t("sequence.seek")} min={0} max={total} step={1} value={frame} disabled={!coherent || controlBusy} onPointerDown={event => { if (event.button !== 0 || !coherent || busy || props.actionBusy || !program?.onScrub || scrub.current)
        return; scrub.current = { pointerId: event.pointerId, originalFrame: frame, element: event.currentTarget }; event.currentTarget.setPointerCapture?.(event.pointerId); run(() => current.current.program?.onScrub?.(framesToMilliseconds(frame), "start")); }} onPointerUp={event => { if (scrub.current?.pointerId !== event.pointerId || !program?.onScrub)
        return; const value = framesToMilliseconds(Number(event.currentTarget.value)); cancelScrub(false); run(() => current.current.program?.onScrub?.(value, "end")); }} onPointerCancel={() => cancelScrub()} onLostPointerCapture={() => cancelScrub()} onChange={event => { const value = framesToMilliseconds(Number(event.target.value)); if (program?.onScrub && scrub.current)
        run(() => current.current.program?.onScrub?.(value, "move"));
    else
        go(Number(event.target.value)); }}/>
   <time data-testid="preview-timecode">{t("sequence.position", { time: formatPreciseTime(framesToMilliseconds(frame), program?.durationMs) })} / {formatPreciseTime(program?.durationMs ?? 0, program?.durationMs)}</time>
  </div>
 </section>;
}
