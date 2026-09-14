# CEVRA Mobile Strategy v1

## Goal
Extend CEVRA Vids with the same product model and design language across desktop and mobile without pretending that every workstation-class local model or desktop sidecar belongs on a phone.

Mobile is an expansion track for CEVRA Vids inside CEVRA Orbit. It must not delay Vids 1.0 and does not depend on Marketplace or unimplemented Orbit services.

## Store-distribution requirement
The mobile architecture must remain publishable through Apple App Store and Google Play without requiring users to install Python, FFmpeg, a separate executable runtime or another app before CEVRA can provide meaningful standalone functionality.

## Mobile-native responsibilities
- Browse/open compatible projects
- Preview and review edits
- Comments/approval
- Lightweight timeline edits
- Caption/style/preset adjustments
- Compatible local media operations
- Lightweight exports supported by platform capabilities

## Mobile media execution
Mobile implements the same `MediaEngineAdapter` contract through platform-compatible native execution rather than the desktop `cevra-media-worker`.

Preferred direction:
- iOS/iPadOS: AVFoundation / VideoToolbox-backed native adapter where appropriate
- Android: MediaCodec / Media3 and platform-native media capabilities where appropriate

Implementation details remain behind adapters and must not enter Project IR.

## Heavy processing
WhisperX, large local image/video models and expensive renders may execute on a paired trusted desktop node or another explicitly configured execution provider. Delegation is optional: the mobile app must retain useful standalone editing/review capability.

## Distribution safety
Do not design mobile functionality around downloading executable runtimes or dynamically adding code outside the platform's approved distribution/update mechanisms. Models and ordinary data assets are treated separately from executable code and remain subject to platform rules at release time.

## Architecture requirement
Mobile and desktop share Project IR, command vocabulary, i18n, design tokens and adapter contracts. Heavy processing is a capability decision, not a forked product architecture.

PT-BR is the initial default locale and EN-US is selectable with feature parity. Mobile capabilities and limitations must be explicit rather than silently changing a shared workflow.
