import type { TranslationKey } from "@cevra/i18n";
import type { KeyboardEvent } from "react";
import type { Translate } from "./ui-model";
import { timelineShortcutBlocked } from "./timeline-interactions";

type Scope = "shell" | "timeline" | "preview";
type Binding = { id: string; label: TranslationKey; scope: Scope; key: string; mod?: boolean; alt?: boolean; shift?: boolean; native?: boolean; display: string; aria: string };
/** UI-only catalogue. Actions still use their visible control's guarded handler. */
export const keyboardBindings = [
  { id: "import", label: "media.import", scope: "shell", key: "i", mod: true, native: true, display: "Cmd/Ctrl+I", aria: "Meta+I Control+I" },
  { id: "export", label: "action.export", scope: "shell", key: "e", mod: true, native: true, display: "Cmd/Ctrl+E", aria: "Meta+E Control+E" },
  { id: "undo", label: "action.undo", scope: "shell", key: "z", mod: true, native: true, display: "Cmd/Ctrl+Z", aria: "Meta+Z Control+Z" },
  { id: "redo", label: "action.redo", scope: "shell", key: "z", mod: true, shift: true, native: true, display: "Shift+Cmd/Ctrl+Z", aria: "Meta+Shift+Z Control+Shift+Z" },
  { id: "select-all", label: "timeline.selectAll", scope: "timeline", key: "a", mod: true, display: "Cmd/Ctrl+A", aria: "Meta+A Control+A" },
  { id: "clear-selection", label: "keyboard.clearSelection", scope: "timeline", key: "a", mod: true, shift: true, display: "Shift+Cmd/Ctrl+A", aria: "Meta+Shift+A Control+Shift+A" },
  { id: "duplicate", label: "sequence.duplicate", scope: "timeline", key: "d", mod: true, native: true, display: "Cmd/Ctrl+D", aria: "Meta+D Control+D" },
  { id: "split", label: "sequence.split", scope: "timeline", key: "b", mod: true, native: true, display: "Cmd/Ctrl+B", aria: "Meta+B Control+B" },
  { id: "earlier", label: "sequence.earlier", scope: "timeline", key: "ArrowUp", alt: true, display: "Alt/Option+↑", aria: "Alt+ArrowUp" },
  { id: "later", label: "sequence.later", scope: "timeline", key: "ArrowDown", alt: true, display: "Alt/Option+↓", aria: "Alt+ArrowDown" },
  { id: "remove", label: "sequence.remove", scope: "timeline", key: "Delete", display: "Delete / Backspace", aria: "Delete Backspace" },
  { id: "fit", label: "timeline.fit", scope: "timeline", key: "z", shift: true, display: "Shift+Z", aria: "Shift+Z" },
  { id: "zoom-in", label: "keyboard.zoomIn", scope: "timeline", key: "=", mod: true, native: true, display: "Cmd/Ctrl+ +", aria: "Meta+Plus Control+Plus" },
  { id: "zoom-out", label: "keyboard.zoomOut", scope: "timeline", key: "-", mod: true, native: true, display: "Cmd/Ctrl+ −", aria: "Meta+- Control+-" },
  { id: "play", label: "preview.playLocal", scope: "preview", key: " ", display: "Space", aria: "Space" },
  { id: "previous-frame", label: "preview.previousFrame", scope: "preview", key: "ArrowLeft", display: "←", aria: "ArrowLeft" },
  { id: "next-frame", label: "preview.nextFrame", scope: "preview", key: "ArrowRight", display: "→", aria: "ArrowRight" },
  { id: "start", label: "keyboard.start", scope: "preview", key: "Home", display: "Home", aria: "Home" },
  { id: "end", label: "keyboard.end", scope: "preview", key: "End", display: "End", aria: "End" },
  { id: "mark-in", label: "preview.markIn", scope: "preview", key: "i", display: "I", aria: "I" },
  { id: "mark-out", label: "preview.markOut", scope: "preview", key: "o", display: "O", aria: "O" }
] as const satisfies readonly Binding[];
export type ShortcutAction = typeof keyboardBindings[number]["id"];
export function nativeKeyboardEnvironment(): boolean { return "__TAURI_INTERNALS__" in window; }
export function shortcutDisplay(binding: { display: string; id: string }, t: Translate): string {
  return binding.id === "play" ? t("keyboard.space") : binding.display;
}
export function shortcutProps(id: ShortcutAction, t: Translate) {
  const binding = keyboardBindings.find(item => item.id === id)! as Binding;
  return { "data-shortcut-action": id, ...(binding.native && !nativeKeyboardEnvironment() ? {} : {
    "aria-keyshortcuts": binding.aria, title: t("keyboard.controlHint", { label: t(binding.label), keys: shortcutDisplay(binding, t) })
  }) };
}
export function shortcutAction(event: KeyboardEvent<HTMLElement>, scope: Scope): ShortcutAction | null {
  if (event.defaultPrevented || event.repeat || event.nativeEvent.defaultPrevented || timelineShortcutBlocked(event.nativeEvent)
    || ["Dead", "Process", "Unidentified"].includes(event.key) || event.metaKey && event.ctrlKey || event.ctrlKey && event.altKey) return null;
  const target = event.target instanceof Element ? event.target : null;
  // Letter-only bindings belong to the focused component itself. Buttons and
  // sliders retain Space/Enter/arrows, including a track's accessible trim handle.
  const componentRoot = target === event.currentTarget;
  return keyboardBindings.find(value => {
    const binding = value as Binding;
    const key = event.key === "Backspace" ? "Delete" : event.key === "+" ? "=" : event.key.length === 1 ? event.key.toLowerCase() : event.key;
    return binding.scope === scope && binding.key === key && (!binding.native || nativeKeyboardEnvironment())
      && Boolean(binding.mod) === (event.metaKey || event.ctrlKey) && Boolean(binding.alt) === event.altKey
      && (binding.id === "zoom-in" && event.key === "+" ? true : Boolean(binding.shift) === event.shiftKey)
      && (binding.mod || binding.alt || componentRoot);
  })?.id ?? null;
}
export function activateShortcut(event: KeyboardEvent<HTMLElement>, root: HTMLElement, action: ShortcutAction): boolean {
  const control = root.querySelector<HTMLButtonElement>(`button[data-shortcut-action="${action}"]`);
  if (!control || control.matches(":disabled") || control.closest("[hidden]") || control.getAttribute("aria-disabled") === "true") return false;
  event.preventDefault(); event.stopPropagation(); control.click(); return true;
}
