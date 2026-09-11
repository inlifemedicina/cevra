# Project IR Migrations

Every persisted Project IR schema change requires an explicit migration and tests.

Naming convention: `v<from>-to-v<to>.ts`.

Preserve a pre-migration backup before any one-way migration.
