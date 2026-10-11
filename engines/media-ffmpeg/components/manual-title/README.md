# Fixed manual title component V1

First-party CoreText rasterizer for the approved manual title slice. This bounded
component does not select the default composition engine (ADR 0012).

Inter is unmodified, licensed under SIL Open Font License 1.1, with its full
license in OFL.txt. Source: google/fonts, revision
0b58fb370093f9a9f4ff785d94405710b79de67c, ofl/inter/Inter[opsz,wght].ttf.
Font SHA256: 29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031.
OFL SHA256: 5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57.

The private font is loaded directly without OS registration or fallback.
Fixed size: 56 px horizontal, 48 px vertical. Full geometry: 1920×1080 or
1080×1920; margin 8% horizontally and 10% from the bottom; bar 84% wide.
Preview reduces the composed canonical picture to 720×404 or 404×720.
Glyph availability and overflow fail before publication; no clipping/fallback.
The helper receives only runtime font path, canonical dimensions, bounded text
and worker-owned output. PNG allocation is reserved before spawning it.

build_worker.py stages the assets and builds the Swift helper on macOS.
The runtime manifest tree seal covers source, font, license and binary;
the font is additionally verified against its fixed pin and the segment cache
includes the binary digest, component, text, local interval and aspect.
Non-macOS builds advertise this component unavailable.
