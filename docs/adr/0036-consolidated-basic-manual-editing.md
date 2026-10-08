# ADR 0036 — Consolidated basic manual editing

Status: OWNER APPROVED / IMPLEMENTED FOR DRAFT REVIEW / NOT MERGED
Date: 2026-10-08
Baseline: e84424ccb65eb57b15747effe64518b17e6e9cdf (Draft #91)

The Owner concluded the grouped review and authorized the basic corrections as
one package: external file drop through existing ingest, reliable first-gesture
reorder, multi-selection duplication, distinct source/occurrence/copy labels,
readable ruler and cursor, stable manual zoom with explicit Fit and visual
trailing space, and identification of the existing MP4/H.264 export.
The preserved passing observations include individual edits, Undo/Redo,
thumbnails, continuous playback and the Portuguese export/file content.
Native close/reopen and measured edit latency remain untested.

## Compatible extension

Project IR, ProjectHistory, the existing ProjectStore and managed Media adapter
remain authoritative. Duplicate-many validates a set of occurrence IDs, reads
them in canonical timeline order, inserts the copies as a block after the last
selected occurrence and publishes one existing atomic timeline.edit command.
One Undo for that block is the approved CEVRA criterion, not a universal editor
claim. Source IDs, ranges and supported properties are copied; originals stay
immutable. The existing TimelineClip.extensions carries only the versioned
cevra.manualClipCopy.v1 presentation provenance (version and originalClipId).
Legacy unmarked clips remain ordinary occurrences. No editable naming feature,
schema migration or second label registry is introduced. UI occurrence numbers
describe current sequence position; stable source numbering remains unchanged.
Unknown or malformed effect extensions continue to fail closed.

Rust captures a bounded native file-drop receipt for the main window. The
WebView can consume its identifier once through a closed application command;
it cannot supply arbitrary paths. A constant-size native metadata query reuses
the existing lifecycle-query pattern, avoiding general event/filesystem/plugin
permissions. Ingest shares the existing picker path validation, Media probe,
source fingerprint, mutation/checkpoint and recovery paths. Repeated registered
local URIs are reused only after current content/identity verification. Invalid
media cannot become a source. A mixed batch reports successful/reused/failed
items; persistence or session uncertainty stops remaining mutations.

Internal reorder uses a captured pointer gesture with stable clip containers
and a visible insertion indication. It commits at release, rejects stale
geometry/snapshots and cancels on Escape, blur or pointer cancellation. Selection
and focused text fields retain their distinct meanings. Presentation geometry
is separate from audiovisual duration: manual pixels/time stay fixed across
duration edits; Fit is explicit; trailing space never extends Project IR,
preview or export. Ruler labels adapt to available spacing and the cursor
shows its exact project-frame position legibly.
Legacy millisecond projects keep a precise millisecond cursor without claiming
an unapproved CFR30 conversion.

No framework, engine, dependency, paid provider, multitrack capability, new
output format or editable renaming is added. Director impact: compatible typed
extension; execution, permissions and history boundaries stay unchanged.
EDVID remains the simplicity reference without copying trade dress.

## Research and limits

[Final Cut import](https://support.apple.com/en-ge/guide/final-cut-pro/ver418155a4/mac)
documents Finder drop; its [arrange guide](https://support.apple.com/en-kz/guide/final-cut-pro/verc147f195/mac)
documents a visible destination while dragging and relocation on release.
[Instance names](https://support.apple.com/en-gb/guide/final-cut-pro/ver4ff39cfa/mac)
are distinct from source identity; editable rename is excluded here.
[Premiere copy](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/copy-and-paste-clips.html)
supports multiple selection. The coordination's verified Resolve 20 guide
page33 distinguishes Full Extent from Custom Zoom; the PDF fetch was unavailable
in this executor, so it is not described as an independent reread.
[Official guide](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-20-Beginners-Guide.pdf?_v=1757574012000).
Do not claim that all editors never auto-fit. Seek playback continuity follows
the existing CEVRA contract and is tested against late decoder events.

## Gates

Offline domain/history/package, UI gesture/focus/shortcut, native receipt/ACL,
real Host/sealed Media integration, final-tree independent review and exact-head
CI precede one grouped future Owner script. No human microtests per commit.
The current app/project remains frozen, no new test window is launched, and no
merge, real AI/provider call or issue #88 body publication is authorized.
