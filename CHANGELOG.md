# Changelog

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
