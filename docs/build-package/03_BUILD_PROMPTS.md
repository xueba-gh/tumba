# Build Prompts — paste these into the new chat, in order

Rules that apply to every phase (paste once at kickoff; they're repeated in
the Phase 0 prompt):
- Read the whole `docs/build-package/` folder before writing code.
- Finish each phase with: lint + typecheck + tests green, a short CHANGELOG
  entry, and a commit + push to GitHub with a clear message.
- Never put an API key, token, or user media in the repo. `.gitignore` covers
  `*.env*`, `config.json`, `media/`, `*.mp4`, `*.wav`, `*.mp3`, `*.zip`.
- If something in the spec is impossible in the browser, say so, propose the
  closest alternative, and keep going — don't stall.
- Keep the UI calm and simple. The user is a creator, not a developer.

---

## Phase 0 — Kickoff (paste first)

```
You are building "Narrated Video Assembler", an open-source web app (plus an
optional Python render agent) that turns a voice-over + script + images/clips
into a finished video with visuals perfectly timed to the narration.

Start by reading every file in docs/build-package/ in this repo:
00_README_START_HERE.md, 01_PRODUCT_SPEC.md, 02_ARCHITECTURE.md,
03_BUILD_PROMPTS.md, 04_RENDER_PIPELINE_REFERENCE.md, 05_AI_PROVIDER_SPEC.md,
06_FEATURE_CHECKLIST.md, and everything in reference_code/. The reference code
is a working Python/ffmpeg pipeline that already produced a correct 9-minute
video; treat its timing math and render parameters as ground truth.

Then, before writing code, reply with:
1. A one-page summary of what you will build, in your own words.
2. The exact monorepo layout you will create (must match 02_ARCHITECTURE.md
   unless you explain a better choice).
3. Anything in the spec you believe cannot be done in the browser, with your
   proposed alternative.
4. The list of phases you will execute (mirror this file).
Wait for my "go" before scaffolding.

Ground rules for the whole build: after every phase run lint, typecheck and
tests, update CHANGELOG.md, then commit and push to GitHub with a descriptive
message. Never commit keys, tokens, or media. If you're unsure about a product
decision, make the choice that keeps the user's media local and the UI simple,
and note the decision in docs/DECISIONS.md.
```

## Phase 1 — Scaffold + core schema + AI provider layer

```
Go. Phase 1:
1. Create the pnpm monorepo per 02_ARCHITECTURE.md: apps/web (Next.js 15, TS
   strict, Tailwind, shadcn/ui, Zustand, zod, Vitest, Playwright), packages/core,
   packages/ai, packages/render-web, packages/ui, apps/agent (Python 3.11,
   FastAPI, poetry or uv), .github/workflows/ci.yml, MIT LICENSE, README.
2. packages/core: implement the Project/Beat/Asset zod schema exactly as in
   02_ARCHITECTURE.md, plus: splitIntoBeats(script, {targetWords, minWords,
   maxWords, maxHoldSec?}) using the abbreviation-aware sentence splitter from
   04_RENDER_PIPELINE_REFERENCE.md §Beat splitting (never split a sentence;
   verify total word count equals the input's); computeProportionalTiming();
   computeAlignedTiming(wordTimings); applySpeed(); exportEDL()/exportSRT().
   Unit tests for all of it, including the "Mrs. Benn" abbreviation case and
   the "audio starts at beat N" case.
3. packages/ai: implement 05_AI_PROVIDER_SPEC.md — a single interface
   {chat(text), vision(images+text)} with adapters for Anthropic, OpenAI,
   Gemini, Ollama, and generic OpenAI-compatible; streaming optional; a
   testConnection(); token/cost estimate; encrypted key store for the browser
   (WebCrypto AES-GCM with a user passphrase, IndexedDB). Mock-based tests.
4. apps/web: Settings page that lets me add providers, paste keys, pick a
   model, and press Test. Nothing else yet.
Commit: "phase 1: monorepo, core schema + beat/timing math, AI provider layer".
```

## Phase 2 — Projects, import, script → beats

```
Phase 2:
1. Projects list page; create/rename/delete/duplicate; export .zip / import
   .zip (project.json + media/) using OPFS for storage and the File System
   Access API for linking a folder (fallback to drag-and-drop where the API
   is unavailable, e.g. Firefox/Safari).
2. Import page: drop audio, images, clips; show waveform (peaks) and duration;
   detect near-duplicate images (perceptual hash) and mark variants.
3. Script page: paste/import script; run splitIntoBeats; show beats as editable
   cards; merge/split; min/max hold controls; "narration starts at beat N";
   word-count verification badge; optional AI actions (rewrite prompts in a
   style, suggest splits, write missing prompts) via the text provider.
4. Prompt export: numbered prompt list (txt + json) for the user's image tool.
Tests for import/export round trip. Commit.
```

## Phase 3 — Matching + review grid

```
Phase 3:
1. Match-by-number (filename starts with the beat number).
2. Match-by-AI: thumbnails (512 px JPEG q70) of all unmatched candidates +
   beats → vision provider → mapping + confidence + notes, using the prompt in
   05_AI_PROVIDER_SPEC.md §Matching prompt. Batch if the provider's image
   limit is lower than the candidate count; show cost estimate first.
3. Review grid: keyboard-first (J/K beats, 1–9 alternates, Space to preview
   the beat's audio with its image), drag any image onto any beat, "spare"
   toggle, coverage report; block render until coverage is complete.
Playwright test: load sample project, run number-matching, override one beat.
Commit.
```

## Phase 4 — Timing: alignment, speed, pacing rules

```
Phase 4:
1. In-browser Whisper (transformers.js, WebGPU when available) → word timings
   for the narration; chunk long audio with overlap; progress UI.
2. Align transcript words to script words (normalised, DP alignment with
   tolerance for TTS mispronunciations) → exact start time per beat; fall back
   to proportional timing for any beat that can't be aligned and flag it.
3. Timing page: waveform with draggable beat markers; min/max hold enforcement
   with a visible warning; narration speed slider (0.85–1.25×, pitch-preserved
   via SoundTouch WASM in an OfflineAudioContext); trim silence; loudness
   normalise to −16 LUFS; everything recomputes live.
4. Beat preview player.
Unit tests on the alignment with a synthetic transcript; e2e on the sample.
Commit.
```

## Phase 5 — Browser renderer

```
Phase 5:
Implement packages/render-web per 02_ARCHITECTURE.md and 04_RENDER_PIPELINE_
REFERENCE.md: Web Worker + OffscreenCanvas frame painter (cover-crop with
focal point, Ken Burns zoom/pan finishing exactly at beat end, dissolve
blending over the transition window, cut, fade-through-black), b-roll clip
frames via VideoDecoder, optional captions from word timings, title/end cards,
watermark; WebCodecs VideoEncoder (H.264, hardware) + AudioEncoder (AAC, with
Opus fallback and a clear message) + mp4-muxer with fast-start; narration at
chosen speed + optional ducked music; progress with ETA, pause/resume/cancel;
post-render verification (duration = audio + cards ±0.1 s, track sanity) and
SHA-256; save via File System Access API or download.
Presets: 1080p, 4K, 9:16, 1:1; "Preview 720p" mode.
E2E: render the 20 s sample in headless Chromium and assert duration.
Commit.
```

## Phase 6 — Deploy + polish

```
Phase 6:
1. Vercel deployment config for apps/web (static export where possible,
   edge route proxy for CORS-blocked providers); add a "Deploy to Vercel"
   button in README; confirm nothing user-owned ever leaves the browser.
2. Templates (save/apply style), batch queue, change-log-based clip cache so
   re-renders are incremental, keyboard shortcuts help panel, empty states,
   error toasts that say what to do.
3. Accessibility pass and mobile-safe layout for the review grid.
4. Write docs/USER_GUIDE.md with screenshots.
Commit. Then deploy and give me the URL.
```

## Phase 7 — Render agent (optional but recommended)

```
Phase 7:
Build apps/agent: FastAPI with /health, /align (faster-whisper → word timings
in the same JSON shape the web app uses), /render (accepts a project zip,
runs the reference_code pipeline unchanged in behaviour, streams progress),
/job/{id}, /download/{id}; bearer-token auth; workspace-dir sandboxing;
run.bat / run.sh; Dockerfile; README with the three ways to run it (desktop,
Docker on a VPS, Fly.io). Add "Render on agent" to the web app's render page
and "Align on agent" to the timing page, with an agent URL + token in
Settings. Cross-check: the same project renders on browser and agent with cut
points within ±1 frame. Commit.
```

## Phase 8 — Hardening

```
Phase 8: Go through 06_FEATURE_CHECKLIST.md item by item, run every check,
fix what fails, and produce a final report of what's done, what's deferred,
and known limitations per browser. Tag v1.0.0. Commit.
```
