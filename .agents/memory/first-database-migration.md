---
name: First database migration setup
description: First-table migration setup and path resolution in this pnpm workspace.
---

When a pnpm workspace with `lib/db` creates its first database table, use app-owned Drizzle migrations: configure `REPLIT_DATABASE_MIGRATIONS=app`, generate and inspect the migration, apply it to development, and run committed migrations before the API server listens.

**Why:** The API workflow runs filtered package scripts from the API artifact directory, while the migration files are stored under the workspace's shared `lib/db` package. A path derived from `process.cwd()` can therefore point at the wrong directory and prevent server startup.

**How to apply:** Follow the database migration skill for first-table setup. Resolve the migrations folder relative to the bundled server entry point so development and production use the same workspace-relative location.
