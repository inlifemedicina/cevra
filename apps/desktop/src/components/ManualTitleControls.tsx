import { MANUAL_TITLE_COMPONENT, resolveManualTitle, validateManualTitle, type ProjectIR } from "@cevra/project-ir";
import type { ManualTitleEdit } from "@cevra/application";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { ManualRangeDraftController } from "./ManualSequenceControls";
import type { Translate } from "../ui-model";
import { nearestMsToFrames } from "../frame-timing";

export function ManualTitleControls({ project, busy, available, t, draft, onCommit, onEdit }: {
  project: Readonly<ProjectIR>; busy: boolean; available: boolean; t: Translate;
  draft: RefObject<ManualRangeDraftController | null>;
  onCommit(request: ManualTitleEdit): Promise<void>; onEdit(request: ManualTitleEdit): Promise<void>;
}) {
  const title = project.graphics[0] ? resolveManualTitle(project.graphics[0]) : undefined;
  const [text, setText] = useState(title?.text ?? "");
  const [start, setStart] = useState(String(title?.startFrame ?? 0));
  const [end, setEnd] = useState(String(title?.endFrame ?? nearestMsToFrames(project.timeline.durationMs)));
  const [aspect, setAspect] = useState<"16:9" | "9:16">(title?.aspect ?? "16:9");
  const [dirty, setDirty] = useState(false), [pending, setPending] = useState(false), [failed, setFailed] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const token = useRef(project.history.headSnapshotId!), composing = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  function reset() {
    setText(title?.text ?? ""); setStart(String(title?.startFrame ?? 0));
    setEnd(String(title?.endFrame ?? nearestMsToFrames(project.timeline.durationMs)));
    setAspect(title?.aspect ?? "16:9"); token.current = project.history.headSnapshotId!;
    setDirty(false); setFailed(false); setNeedsConfirmation(false);
  }
  useEffect(() => { if (!dirty) reset(); }, [project.history.headSnapshotId, dirty]);
  function touch() {
    if (!dirty || failed) token.current = project.history.headSnapshotId!;
    setDirty(true); setFailed(false); setNeedsConfirmation(false);
  }
  let candidate: ReturnType<typeof validateManualTitle> | undefined;
  try {
    if (!/^\d+$/u.test(start) || !/^\d+$/u.test(end)) throw Error();
    candidate = validateManualTitle({ version: 1, componentId: MANUAL_TITLE_COMPONENT, text,
      startFrame: Number(start), endFrame: Number(end), aspect });
    if (candidate.endFrame > nearestMsToFrames(project.timeline.durationMs)) throw Error();
  } catch { candidate = undefined; }
  const editable = available && project.timeline.timingPolicy === "cfr30" && project.timeline.clips.length > 0;
  function publish(commit: (request: ManualTitleEdit) => Promise<void>): Promise<void> | undefined {
    if (inFlight.current) return inFlight.current;
    if (!dirty) return;
    if (composing.current) return Promise.reject({ code: "MANUAL_TITLE_INVALID" });
    if (!candidate || !editable) return Promise.reject({ code: "MANUAL_TITLE_INVALID" });
    const request: ManualTitleEdit = { version: 1, type: "set", expectedSnapshotId: token.current, title: candidate };
    setPending(true);
    inFlight.current = commit(request).then(() => { setDirty(false); setFailed(false); }, cause => {
      setFailed(true); throw cause;
    }).finally(() => { setPending(false); inFlight.current = null; });
    return inFlight.current;
  }
  useLayoutEffect(() => { draft.current = { settle: () => {
    if (!dirty) return;
    if (!title) {
      setNeedsConfirmation(true);
      return Promise.reject({ code: "MANUAL_TITLE_PENDING" });
    }
    return publish(onCommit);
  } }; });
  useLayoutEffect(() => () => { draft.current = null; }, [draft]);
  const disabled = busy || pending || !editable;
  return <section className="manual-title-controls" aria-label={t("title.controls")}>
    <h3>{t("title.controls")}</h3>
    <p>{t(available ? "title.fixedStyle" : "title.unavailable")}</p>
    <fieldset disabled={disabled} onKeyDown={event => {
      if (event.nativeEvent.isComposing || composing.current || event.repeat) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); reset(); }
      if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void publish(onEdit)?.catch(() => {}); }
    }}>
      <label>{t("title.text")}<input type="text" maxLength={80} value={text} aria-label={t("title.text")} aria-invalid={dirty && !candidate}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onChange={event => { touch(); setText(event.target.value); }} /></label>
      <div className="property-grid">
        <label>{t("title.in")}<input type="number" min="0" step="1" value={start} aria-label={t("title.in")} onChange={event => { touch(); setStart(event.target.value); }} /></label>
        <label>{t("title.out")}<input type="number" min="1" step="1" value={end} aria-label={t("title.out")} onChange={event => { touch(); setEnd(event.target.value); }} /></label>
      </div>
      <label>{t("title.aspect")}<select value={aspect} aria-label={t("title.aspect")} onChange={event => { touch(); setAspect(event.target.value as "16:9" | "9:16"); }}>
        <option value="16:9">{t("title.landscape")}</option><option value="9:16">{t("title.portrait")}</option>
      </select></label>
      <button type="button" className="secondary-button" disabled={!dirty || !candidate} onClick={() => { void publish(onEdit)?.catch(() => {}); }}>{t(title ? "title.apply" : "title.add")}</button>
      <button type="button" className="secondary-button" disabled={!dirty} onClick={reset}>{t("title.cancel")}</button>
    </fieldset>
    <button type="button" className="secondary-button" disabled={busy || pending || !available || !title} onClick={() => {
      // Removal discards the uncommitted title draft; it is one History action.
      reset(); setPending(true);
      void onEdit({ version: 1, type: "remove", expectedSnapshotId: project.history.headSnapshotId! }).catch(() => {}).finally(() => setPending(false));
    }}>{t("title.remove")}</button>
    {(needsConfirmation || failed || dirty && !candidate) && <p role="alert">{t(needsConfirmation ? "title.pending" : "title.invalid")}</p>}
  </section>;
}
