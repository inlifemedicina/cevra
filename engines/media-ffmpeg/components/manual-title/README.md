# Fixed manual title component V1

First-party CoreText rasterizer for the approved manual title slice. This bounded
component does not select the default composition engine (ADR 0012).

Inter is unmodified, licensed under SIL Open Font License 1.1, with its full
license in OFL.txt. Source: google/fonts, revision
0b58fb370093f9a9f4ff785d94405710b79de67c, ofl/inter/Inter[opsz,wght].ttf.
Font SHA256: 29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031.
OFL SHA256: 5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57.

Inter is loaded privately without OS registration. CoreText preserves complete
Unicode graphemes, variation selectors, ZWJ sequences and modifiers. Emoji
presentation uses native AppleColorEmoji; text presentation stays textual. The
primary Inter cascade includes native Arial Unicode for missing scripts. Only
faces from the sealed `/System/Library/Fonts` collection or pinned private Inter
are admitted. No system font bytes are redistributed or globally registered.
A genuinely unavailable cluster renders one □; canonical text is unchanged.
The report records normalized drawn text, substitutions, used faces and exact
font-file SHA-256. Isolated selectors render □; selectors on bases are preserved.

Fixed size: 56 px horizontal, 48 px vertical. Full geometry: 1920×1080 or
1080×1920; margin 8% horizontally and 10% from the bottom; bar 84% wide.
Preview reduces the same composed canonical picture to 720×404 or 404×720.
Overflow rejects before publication. The helper receives only runtime font path,
canonical dimensions, bounded text/layout and worker-owned output. PNG allocation
is reserved before spawning it.

build_worker.py stages the assets and builds the Swift helper on macOS.
The runtime manifest tree seal covers source, font, license and binary;
the font is additionally verified against its fixed pin and the segment cache
includes the binary digest, component, text, local interval and aspect. Host and
worker caches also include fresh OS build/system-font file identities; post-render
identity checks reject changes. Untitled occurrences retain aspect but are not
invalidated by invisible title text or layout edits.
Non-macOS builds advertise this component unavailable.
