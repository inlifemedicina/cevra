# CEVRA Project IR v1

Project IR is the canonical engine-neutral editable representation of a CEVRA project.

## Rules
- JSON-serializable and schema-versioned.
- Stable IDs for assets, tracks, clips, captions, graphics and generated assets.
- Time stored in integer milliseconds in v1 unless a specialized rational time structure is explicitly required by interchange adapters.
- No raw FFmpeg filters, HyperFrames source code or provider-specific secrets in the core schema.
- Engine/provider-specific data belongs under namespaced `extensions` only when unavoidable.
- Mutations are performed through typed commands and recorded in history.
- Older schemas open through deterministic migrations.

## Core sections
- `project`
- `sources`
- `transcript`
- `timeline`
- `captions`
- `graphics`
- `layouts`
- `audio`
- `style`
- `generation`
- `history`
- `qa`
- `exports`
- `extensions`

## Project portability
Project metadata must remain portable across desktop installations. Secrets, caches, generated previews and machine-specific paths are external to the portable core.
