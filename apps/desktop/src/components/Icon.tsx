import type { ReactNode } from "react";

type IconName = "media" | "preset" | "element" | "text" | "transition" | "effect" | "ai" | "settings" | "undo" | "redo" | "play" | "pause" | "volume" | "fit" | "fullscreen" | "lock" | "eye" | "mute" | "search" | "chevron" | "spark" | "inspect" | "panel";

const glyphs: Record<IconName, ReactNode> = {
  media: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m8 14 3-3 5 5 2-2 3 3"/></>,
  preset: <><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><path d="M16.5 14v6M13.5 17h6"/></>,
  element: <><circle cx="8" cy="8" r="4"/><rect x="11" y="11" width="9" height="9" rx="2"/></>,
  text: <><path d="M5 5h14M12 5v14M8 19h8"/></>,
  transition: <><path d="M4 7h11M12 4l3 3-3 3M20 17H9M12 14l-3 3 3 3"/></>,
  effect: <><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/><path d="m18 15 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z"/></>,
  ai: <><path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></>,
  undo: <><path d="m9 7-5 5 5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></>,
  redo: <><path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/></>,
  play: <path d="m8 5 11 7-11 7V5Z"/>,
  pause: <><path d="M9 5v14M15 5v14"/></>,
  volume: <><path d="M5 10v4h4l5 4V6L9 10H5Z"/><path d="M17 9a4 4 0 0 1 0 6"/></>,
  fit: <><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"/></>,
  fullscreen: <><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5"/></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  mute: <><path d="M5 10v4h4l5 4V6L9 10H5Z"/><path d="m18 10 4 4M22 10l-4 4"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></>,
  chevron: <path d="m8 10 4 4 4-4"/>,
  spark: <path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z"/>,
  inspect: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M14 4v16"/></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg className="icon" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{glyphs[name]}</svg>;
}
