# CEVRA Licensing and Provenance Policy v1

CEVRA-owned code is proprietary and all rights are reserved unless explicitly stated otherwise.

## Preferred third-party licenses
- Apache-2.0
- MIT
- BSD-2-Clause / BSD-3-Clause
- Python Software Foundation License and other permissive runtime component licenses when redistribution obligations are documented

## Review required
- LGPL
- GPL
- AGPL
- MPL-2.0 when source from the MPL-covered project itself is incorporated or modified
- PolyForm or other source-available/noncommercial licenses
- Proprietary/UNLICENSED
- Model-specific custom licenses

## Source reuse
Permissively licensed code may be reused only after recording exact upstream source, commit/version, license, modifications and required notices.

This rule also applies to Content Intelligence references such as comment-search, research, social-listening, ideation or creator-workflow products. Product similarity or public source availability alone does not authorize copying. If an exact compatible license/provenance cannot be verified, CEVRA may study observable behavior and independently reimplement the required functionality.

The public `fillrochaa/edvid` project under the MIT license is the initial CEVRA Vids functional baseline. Source reuse requires an exact commit, license verification, recorded modifications and required MIT attribution. CEVRA does not copy EDVID branding, trade dress or product names.

External creative skills require the same source, version, license and commercial-compatibility review. Paid or proprietary skills, including BUDOSKILL, must not be copied or redistributed without an explicit license. Public capability descriptions may guide independent implementation but do not license proprietary source.

## Managed Python runtime
CEVRA may redistribute a private CPython runtime for desktop use. Each release must record the exact interpreter build, source, architecture and bundled native libraries. Required Python and third-party license texts/notices must ship with the commercial release. The release pipeline must avoid runtime builds that introduce unacceptable copyleft obligations unless explicitly reviewed and approved.

The current preferred source for redistributable CPython artifacts is Astral `python-build-standalone`, subject to release-level audit of the selected artifact and its bundled dependency licenses. CEVRA does not depend on or modify the user's global/system Python.

## Clean-room references
UNLICENSED/proprietary systems such as Auroq may be studied for externally observable behavior and architecture, but implementation must be independently written unless a separate compatible license is obtained.

## Models, APIs and content providers
AI models, social APIs, content-source providers, analytics providers and publishing integrations are audited independently from CEVRA-owned code. Their licenses, API terms, redistribution limits, platform policies and data-use restrictions must be reviewed before a concrete integration ships.

## Release requirement
Commercial releases must include the required third-party notices, license texts and any source/source-offer obligations applicable to redistributed components.


## Product licensing and entitlement

CEVRA product licensing is distinct from third-party dependency licensing.

CEVRA Vids commercial access uses a CEVRA-owned entitlement layer. Billing provider state is projected into CEVRA entitlements rather than becoming application-domain state.

Development may use a local Development Entitlement with no live billing/backend dependency, but production/stable builds must reject development bypasses. Commercial/staging activation uses signed entitlements, device policy and provider-neutral billing integration.

Expired commercial entitlement enters Recovery Mode: users retain access to projects/original sources for recovery, but cannot generate/export/save a new usable final video.

The entitlement service does not require storage of user project media. Private signing keys, billing secrets and webhook secrets never ship in the desktop application.
