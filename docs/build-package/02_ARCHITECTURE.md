# Architecture

## Shape
A pnpm monorepo, one GitHub repo, MIT license.

```
narrated-video-assembler/
├─ apps/
│  ├─ web/                 # Next.js 15 (App Router) + TypeScript — the product. Deploys to Vercel.
│  └─ agent/               # Python 3.11 + FastAPI + ffmpeg — optional render/alignment agent.
├─ packages/
│  ├─ core/                # Pure TypeScript, no DOM: beat splitting, timing math, project schema (zod), EDL export.
│  ├─ ai/                  # Provider-agnostic AI client (text + vision) with adapters per provider.
│  ├─ render-web/          # Browser renderer: canvas frame painter, Ken Burns/dissolve math, WebCodecs encoder, mp4 muxing, worker.
│  └─ ui/                  # Shared shadcn/ui components, theme.
├─ docs/build-package/     # This folder.
├─ samples/                # A 20-second public-domain sample project for tests/demos.
└─ .github/workflows/      # CI: lint, typecheck, unit tests, e2e sample render (headless Chromium).
```

Why a monorepo: `packages/core` is the single source of truth for *what the
video is* (project.json). Both renderers consume the same schema, so the
browser and the agent always agree on cut points.

## Data model — `project.json` (zod schema in `packages/core`)
```
Project {
  id, name, createdAt, updatedAt, version: "1"
  output: { aspect: "16:9"|"9:16"|"1:1", width, height, fps: 30, codec: "h264" }
  audio: { fileRef, durationSec, speed: 1.0, trimStartSec, trimEndSec, loudnessTarget: -16 }
  script: { text, language }
  beats: Beat[]
  assets: Asset[]
  style: { transition: "dissolve"|"cut"|"fadeblack", transitionSec: 0.5,
           kenBurns: { zoomMin: 1.035, zoomMax: 1.04, alternate: true },
           titleCard?: {...}, endCard?: { enabled, title, tagline, seconds, mode: "lastframe"|"solid"|"image" },
           captions?: { enabled, style }, music?: { fileRef, gainDb, duck: true }, watermark?: {...} }
  timing: { mode: "aligned"|"proportional", startsAtBeat: 1, minHoldSec: 4, maxHoldSec: 15,
            wordTimings?: WordTiming[] }
  ai: { visionProviderId, textProviderId }   // ids into local settings, never keys
  changeLog: [{ at, what }]
}
Beat { n, text, prompt?, type: "image"|"clip"|"title"|"blank", assetId?, startSec?, durSec?,
       motion?: "in"|"out"|"panLR"|"panRL"|"none", transitionOverride?, notes?, confidence? }
Asset { id, kind: "image"|"clip"|"audio", name, fileRef, sha256, width, height, durationSec?,
        caption?, tags[], spare: boolean }
```
`fileRef` points into OPFS (browser) or a relative path (agent). A project
export is a zip: `project.json` + `media/`.

## The web app (apps/web)
- Next.js 15, TypeScript strict, Tailwind, shadcn/ui, Zustand for state,
  zod for validation, Vitest + Playwright.
- **All media stays in the browser**: OPFS (Origin Private File System) for
  project storage; File System Access API to save renders and to "link" a
  folder on disk. IndexedDB for settings and encrypted keys.
- Pages: `/` projects list · `/p/[id]/import` · `/p/[id]/script` (beats) ·
  `/p/[id]/match` (review grid) · `/p/[id]/timing` (waveform + beat markers) ·
  `/p/[id]/style` · `/p/[id]/render` · `/settings` (providers, agent URL).
- AI calls go **directly from the browser to the provider** (CORS is fine for
  Anthropic, OpenAI, Gemini, Ollama with `OLLAMA_ORIGINS=*`). A tiny Next.js
  route handler proxy exists only for providers that block browser CORS, and it
  never logs or stores keys (key is passed per-request in a header).
- Whisper in the browser: `@xenova/transformers` whisper-small (WebGPU when
  available, WASM fallback). For long audio, chunk to 30 s windows with
  overlap; produce word timings; align to script with a DP alignment on
  normalised words (see 04_RENDER_PIPELINE_REFERENCE.md §Timing).

## The browser renderer (packages/render-web)
- Runs in a **Web Worker** with `OffscreenCanvas`.
- Frame loop: for t in frames → determine active beat(s) → draw image with
  Ken Burns transform (and the next image blended during a dissolve) →
  `VideoFrame` → `VideoEncoder` (avc1.640028 High@4.0 for 1080p30; avc1.640033
  for 4K) → `mp4-muxer` (fast-start on).
- Audio: decode narration with `AudioContext.decodeAudioData`, apply speed via
  OfflineAudioContext + a time-stretch (SoundTouch WASM) when speed ≠ 1, mix
  music with ducking, encode with `AudioEncoder` (AAC) — or, if AAC isn't
  available in that browser, mux Opus and offer "remux to AAC on agent".
- Output verified by re-parsing the MP4 (duration, track count) before saving.
- Performance targets: 1080p30 ≥ 60 fps encode on an integrated GPU laptop.

## The render agent (apps/agent)
- FastAPI on `127.0.0.1:8765` (or any host); endpoints: `/health`,
  `/align` (faster-whisper → word timings), `/render` (job), `/job/{id}`,
  `/download/{id}`. CORS enabled for the web app's origin.
- Uses exactly the pipeline in `reference_code/render.py` (Ken Burns via
  zoompan, dissolve via xfade, tree-merge, mux, end card, concat, verify).
- Packaging: `pipx install` or a single `run.bat`/`run.sh`; optional
  PyInstaller one-file build; optional Dockerfile for cloud boxes (Fly.io,
  Railway, a $5 VPS).
- Security: bearer token in config; never exposes the filesystem beyond a
  configured workspace directory.

## Deploy & flexibility
- **Vercel** hosts `apps/web` (static + a couple of edge routes). No media
  touches Vercel. Free tier is fine.
- **Any computer**: open the URL, import the project zip (or link the folder),
  render in the browser, save locally.
- **Desktop away? Cloud agent**: run the agent in Docker on a cheap VPS; put
  its URL + token in Settings; the web app uploads the project zip to it and
  pulls the MP4 back.
- **GitHub**: repo holds code + docs + sample project only. User media never
  goes to git (gitignored), unless the user opts into Git LFS for a project.

## Key decisions (so the builder doesn't re-litigate them)
- TypeScript everywhere in the web app; Python only in the agent.
- H.264 output always (YouTube-safe); VP9/AV1 optional later.
- Dissolve default 0.5 s; Ken Burns 3.5–4 % alternating; 30 fps; these came
  from a working production pipeline and look right for calm narration.
- Proportional timing is the guaranteed fallback; alignment is the upgrade.
- No accounts, no backend database. Everything the user owns is a file.
