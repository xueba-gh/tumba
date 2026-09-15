# Changelog

## Phase 1 — Scaffold + core schema + AI provider layer
- pnpm monorepo scaffolded: `apps/web` (Next.js 15, TS strict, Tailwind,
  Zustand), `apps/agent` (placeholder for Phase 7), `packages/core`,
  `packages/ai`, `packages/render-web` (placeholder for Phase 5),
  `packages/ui` (placeholder), `.github/workflows/ci.yml`.
- `packages/core`: Project/Beat/Asset zod schema; `splitIntoBeats` with the
  abbreviation-aware sentence splitter and word-count verification;
  `computeProportionalTiming`; `computeAlignedTiming`; `applySpeed`;
  `enforceHoldLimits`; `exportEDL`/`exportSRT`. Unit tests cover the
  "Mrs. Benn" abbreviation case and the "audio starts at beat N" case.
- `packages/ai`: single `AIProvider` interface (`chat`, `vision`,
  `testConnection`, `estimateCost`) with adapters for Anthropic, OpenAI,
  Gemini, Ollama, OpenAI-compatible, and OpenRouter; WebCrypto AES-GCM key
  store (PBKDF2, 200k iterations); matching/script-analysis prompt
  builders per the spec. Mock-based (fetch-injected) tests for every
  adapter kind.
- `apps/web`: Settings page — add a provider, paste a key, pick a model,
  press Test. Nothing else yet, per the Phase 1 spec.
- **Not verified in this session**: neither the cloud build environment nor
  this computer's sandboxed shell can reach the npm registry, so
  `pnpm install`, lint, typecheck, and the test suites have not actually
  been run yet. All of this code was written by hand against the spec and
  needs a real `pnpm install && pnpm lint && pnpm typecheck && pnpm test`
  pass — see docs/DECISIONS.md.

## Phase 0 — Kickoff
- Committed the full build package (`docs/build-package/`): product spec,
  architecture, build prompts, render pipeline reference, AI provider spec,
  feature checklist, and the reference Python/ffmpeg implementation.
- Recorded the Phase 0 kickoff decisions in `docs/DECISIONS.md`.
