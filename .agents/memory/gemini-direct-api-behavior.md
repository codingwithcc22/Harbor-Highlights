---
name: Gemini direct API behavior
description: Model availability and output-token behavior observed with this guide's direct Google Gemini API key.
---

For the current direct Gemini API key, `gemini-3.8-flash` worked while `gemini-2.5-flash` returned 404. The 3.8 model can spend output-token budget on internal reasoning; `ThinkingLevel.LOW` produced complete local-food answers within the configured cap. Short-token requests can still return `MAX_TOKENS`, which should be surfaced as a cutoff. Intermittent provider 503 responses were also observed, so keep a bounded retry and a friendly fallback.

**Why:** Several live requests showed model-version differences, output-budget behavior, and transient provider unavailability that are not obvious from the page code.

**How to apply:** Keep `GEMINI_MODEL` configurable, verify model availability when changing the default, preserve the low thinking level for concise guide answers, and never expose API credentials in logs or responses.
