export type TimelineSeekPhase = "single" | "start" | "move" | "end" | "cancel";

export function timelineSelection(ordered: readonly string[], selected: readonly string[], id: string, anchor: string | null,
  modifiers: { shift: boolean; toggle: boolean }): string[] {
  if (!ordered.includes(id)) return [...selected];
  if (modifiers.shift && anchor && ordered.includes(anchor)) {
    const start = ordered.indexOf(anchor), end = ordered.indexOf(id);
    const range = ordered.slice(Math.min(start, end), Math.max(start, end) + 1);
    const chosen = new Set(modifiers.toggle ? [...selected, ...range] : range);
    return ordered.filter(item => chosen.has(item));
  }
  if (!modifiers.toggle) return [id];
  const chosen = new Set(selected);
  if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
  return ordered.filter(item => chosen.has(item));
}

/** A moved group retains canonical internal order; one request publishes the permutation. */
export function reorderedTimeline(ordered: readonly string[], selected: readonly string[], target: string, after: boolean): string[] {
  const chosen = new Set(selected);
  if (!chosen.size || chosen.has(target) || !ordered.includes(target) || selected.some(id => !ordered.includes(id))) return [...ordered];
  const remaining = ordered.filter(id => !chosen.has(id));
  const index = remaining.indexOf(target) + Number(after);
  remaining.splice(index, 0, ...ordered.filter(id => chosen.has(id)));
  return remaining;
}

export function timelineShortcutBlocked(event: { target: EventTarget | null; isComposing?: boolean; keyCode?: number }): boolean {
  if (event.isComposing || event.keyCode === 229) return true;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, [role="textbox"]') || target instanceof HTMLElement && target.isContentEditable) return true;
  const editable = target?.closest("[contenteditable]");
  if (editable && editable.getAttribute("contenteditable") !== "false") return true;
  return Boolean(document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]:not([aria-hidden="true"]), [role="alertdialog"][aria-modal="true"]:not([aria-hidden="true"])'));
}
