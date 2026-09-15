# Narrated Video Assembler — Build Package

This folder is everything a fresh Claude chat (with GitHub connected) needs to
build the app. Nothing here is niche-specific: the app turns **any voice-over +
any set of images (or clips) + a script** into a finished, perfectly paced
video. The Reader's Mind channel is just the first user.

## What's in this folder

| File | Purpose |
|---|---|
| `00_README_START_HERE.md` | This file. How to use the package. |
| `01_PRODUCT_SPEC.md` | What the product is, who it's for, every feature, and the acceptance criteria. |
| `02_ARCHITECTURE.md` | Recommended tech stack, repo layout, how rendering works in the browser and on a render agent, and the honest truth about Vercel. |
| `03_BUILD_PROMPTS.md` | The exact prompts to paste into the new chat, in order, phase by phase. Each phase ends with a commit to GitHub. |
| `04_RENDER_PIPELINE_REFERENCE.md` | The proven ffmpeg pipeline (Ken Burns, crossfade tree-merge, end card, verification) and the timing algorithm, written so it can be ported to WebCodecs or run as-is on a render agent. |
| `05_AI_PROVIDER_SPEC.md` | The provider-agnostic AI layer: Anthropic, OpenAI, Gemini, Ollama/local, any OpenAI-compatible endpoint. Key storage rules. The image-matching and script-analysis prompts. |
| `06_FEATURE_CHECKLIST.md` | Tick-box acceptance list to run before calling any phase done. |
| `reference_code/` | Working Python + ffmpeg implementation of the pipeline (tested in a sandbox on a real 42-image, 9-minute video). Use it as the reference for the render agent and as the ground truth for the browser renderer's behaviour. |

## How to use it (5 minutes)

1. Push this folder to a **new GitHub repo** (e.g. `narrated-video-assembler`) as `docs/build-package/`, or just keep it on disk and attach the files.
2. Start a **new Claude chat with GitHub connected** to that repo.
3. Paste the "Phase 0 — Kickoff" prompt from `03_BUILD_PROMPTS.md`. It tells Claude to read this whole folder first.
4. Work through the phases in order. Each phase ends with tests passing and a commit. Don't skip Phase 1 (the AI provider layer) — everything else plugs into it.
5. Deploy the web app to Vercel at the end of Phase 6. From then on you can work from any computer with Chrome; rendering happens in the browser and the MP4 saves to that computer.

## Two things to decide up front (the prompts assume these answers)

- **Web-first, desktop-optional.** The core app is a web app (Next.js) that runs at a Vercel URL and renders video *in the browser* with WebCodecs. An optional **render agent** (Python + ffmpeg) can run on your desktop or a cloud box for long/heavy jobs. You never depend on the desktop being on.
- **Your keys, your choice of AI.** Every AI feature (image matching, script analysis, beat splitting, prompt writing) works with whichever provider you pick: Anthropic, OpenAI, Google Gemini, Ollama on your own machine, or any OpenAI-compatible server. Keys are stored in your browser (encrypted) or in the agent's local config — never in the repo, never on Vercel.

## Why the browser renders the video (read this once)

Vercel runs "serverless functions": they stop after a few seconds, have no
ffmpeg, no persistent disk, and can't hold a 300 MB file. So a Vercel-hosted
app cannot render video *on the server*. What works — and works well — is
rendering **in the browser** with the WebCodecs API: Chrome encodes H.264
using the computer's own hardware, the app draws every frame on a canvas
(Ken Burns + dissolves), muxes to MP4, and saves it straight to disk with the
File System Access API. A 10-minute 1080p video renders in roughly 2–5 minutes
on an ordinary laptop. That's the primary path. The render agent is the
fallback for 4K, hour-long, or batch work.
