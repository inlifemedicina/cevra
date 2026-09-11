# CEVRA Integrations v1

## Principle
External APIs and local services are providers behind stable CEVRA contracts. Provider changes must not alter Project IR or UI architecture.

## Provider lifecycle
- configure/connect
- secure credential storage where required
- healthcheck
- capabilities
- execute
- disconnect

## Initial categories
- Agent hosts: Codex, Claude Code
- Stock media: local files first; optional external stock providers
- Image generation: local provider slot
- Video generation: local provider slot
- Music/audio generation: optional provider slot
- External editor interchange: OpenTimelineIO; reserved adapters for OpenCut/Premiere/Resolve

## Credentials
Keys/tokens are never stored in repository files or Project IR. Use OS-backed secure storage.

## Optional APIs
Any API requiring additional cost must be explicitly optional and clearly identified in onboarding/settings. Core editing remains operational without paid AI API usage.
