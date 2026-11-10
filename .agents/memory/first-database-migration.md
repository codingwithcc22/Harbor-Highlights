---
name: Database publishing ownership
description: Avoid mixing startup migrations with this project's Publish-managed production schema.
---

Keep production schema changes Publish-managed in this project. Do not add a startup migrator or enable app-owned migrations merely because the development public schema was initially empty.

**Why:** During publishing on 2026-11-10, production already contained the dish-photo table while its Drizzle migration ledger was empty. Replaying the initial migration at startup crashed with “relation already exists.” Read-only checks confirmed development and production schemas matched. No production application migration had completed.

**How to apply:** Apply schema changes to development, then let Publish update production. Keep development migration tooling separate from API startup. Never fix this conflict by dropping production tables or blindly marking migrations as applied.
