# Changelog

## Phase 3 — Matching + review grid
- `apps/web/src/lib/matcher.ts`: deterministic match-by-number from leading
  filename numbers (`01_`, `beat-02-`, `03.`); AI vision matching that resizes
  candidates to 512px JPEG q70, batches to the provider's image limit, and
  parses the mapping/confidence/notes response. By default it only sends
  **unmatched** beats and **unused** candidates, so manual assignments survive
  and the image payload stays small; a "re-match every beat" option overrides.
- **Match page (`/p/[id]/match`)**: keyboard-first review grid — J/K and arrows
  walk beats, 1–9 assign a candidate, Space auditions the narration. Drag a
  candidate onto a beat, pick from a per-beat dropdown, clear an assignment, or
  toggle spare. Coverage report with progress bar, unmatched-beat list, unused
  candidate count, and a duplicate-use warning. Cost estimate shown before any
  AI call.
- **Render gate**: the render step is locked in the pipeline nav and blocked on
  its own page until every beat has a visual, per spec.
- **Live pipeline state**: `saveProject` now emits `nva:project-saved`, and the
  project layout re-reads on it — previously the nav kept the state from its
  first mount, so completing a match left the render step locked until reload.
- Fixed the AI cost estimate measuring `String(totalChars).length` (4 chars)
  instead of the actual prompt text.
- Tests: 22 unit tests for the matcher's pure functions and AI guards;
  Playwright config plus 4 e2e specs driving the real UI (all passing).
- Build scripts for `esbuild` and `unrs-resolver` allow-listed in
  `pnpm-workspace.yaml`, clearing the pnpm 10 "ignored build scripts" warning.

## Phase 2.5 — Design system + UI rebuild
- `skills/ui-ux-pro-max/`: vendored the UI/UX skill and added
  `references/web-pro-rules.md` — the web/desktop counterpart to the existing
  native rules, including the anti-"AI slop" anti-pattern table, pointer and
  keyboard state rules, and a web pre-delivery checklist. `SKILL.md` now routes
  by platform and documents the `--design-system` landing-page bias.
- `design-system/narrated-video-assembler/MASTER.md`: tokens, type scale,
  spacing, motion budget, and component conventions for the app.
- `apps/web`: semantic CSS-variable tokens with a re-picked (not inverted) dark
  theme, Inter + JetBrains Mono via `next/font`, a 30-icon inline SVG set
  replacing every emoji, shared primitives (`components/ui.tsx`) with a
  focus-trapping modal, a Light/Dark/System toggle with no flash of wrong
  theme, and a pipeline nav that shows done/current/available/locked state.
  All `alert()`/`confirm()` calls replaced with inline errors and dialogs.
- `eslint-config-next` was missing, so `next lint` had never actually linted
  anything; added it and fixed everything it surfaced.
- `next.config.mjs`: `resolve.extensionAlias` so webpack resolves the workspace
  packages' ESM-style `.js` specifiers to their TypeScript sources.

## Phase 3 — Matching + review grid
- `apps/web/src/lib/matcher.ts`:
  - **Match-by-Number**: Regex-based automatic assignment for files starting with numeric prefixes (`01_hero.png`, `02-scene.jpg`, etc.).
  - **Match-by-AI Vision**: 512px thumbnail scaler + batching logic (`buildMatchingVisionRequest`, `parseMatchingResponse`) for querying vision AI models with token cost estimation.
  - **Coverage Metrics**: Live calculation of total/matched/unmatched beats, unused assets, and duplicate candidate assignments.
- `apps/web/src/app/p/[id]/match/page.tsx`:
  - **Keyboard-First Review Grid**: `J`/`K` or Up/Down navigation across beats, `1`–`9` keys to assign candidate images, `Space` for audio preview, and shortcut help bar.
  - **Drag-and-Drop Matching**: Drag any candidate asset card directly onto any beat card.
  - **Coverage Progress Bar**: Visual progress bar indicating completion status and blocking/warning gate.
  - **Cost Estimation Modal**: Pre-flight token usage estimate before querying Vision AI models.
- `apps/web/e2e/match.spec.ts`: Playwright test covering match-by-number, coverage calculation, and beat assignment override.

## Phase 2 — Projects, import, script → beats
- `packages/core`: pure TS ZIP creation (`createZipArchive`, `exportProjectToZip`) and extraction (`parseZipArchive`, `importProjectFromZip`) supporting uncompressed storage and Deflate decompression. Unit tests added and passing in `zip.test.ts`.
- `apps/web`:
  - **Projects Management (`/`)**: project dashboard with aspect ratio previews, audio duration, beat/asset counts, create project modal, rename, duplicate, delete, ZIP export/import, and File System Access API folder linking.
  - **Storage Layer (`lib/projectStorage.ts`)**: OPFS storage engine for `project.json` and `media/` files with LocalStorage metadata index fallback.
  - **Media Import (`/p/[id]/import`)**: drag-and-drop / file selector for audio, images, video clips, and scripts; audio peak waveform extraction and canvas preview; 64-bit dHash perceptual hashing (`lib/imageHash.ts`) for near-duplicate image detection and variant badges; spare toggle and asset deletion.
  - **Script & Beats (`/p/[id]/script`)**: sentence-aware beat splitting with configurable target/min/max word parameters; word-count verification badge; narration "starts at beat N" selector; editable beat cards (text, prompt, type, motion, merge, delete); AI prompt rewrites and missing prompt generation via configured AI text providers.
  - **Prompt Export (`components/PromptExportModal.tsx`)**: numbered prompt exporter supporting plain text (`.txt`) and JSON (`.json`) downloads and clipboard copying.

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
