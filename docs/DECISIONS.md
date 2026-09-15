# Decisions log

Running log of product/architecture decisions made during the build that
aren't already pinned down in `docs/build-package/`. Newest first.

## Phase 0 — Kickoff

- **Monorepo layout**: adopted `02_ARCHITECTURE.md`'s layout unchanged
  (`apps/web`, `apps/agent`, `packages/core`, `packages/ai`,
  `packages/render-web`, `packages/ui`) — it's sound and there's no reason
  to deviate.
- **AAC audio encoding in WebCodecs**: not reliably available outside
  Chrome/Chromium. Plan: encode AAC where `AudioEncoder` supports it, fall
  back to Opus with a visible "for best compatibility, render in Chrome"
  notice, per the spec's own fallback language.
- **File System Access API** (folder linking, direct-to-disk save): Chromium
  only. Plan: feature-detect; fall back to drag-and-drop import and a
  standard browser download for the rendered MP4.
- **In-browser Whisper**: WebGPU gives good speed; WASM fallback will be
  slower on long audio. Plan: chunk aggressively (30 s windows with
  overlap, per `04_RENDER_PIPELINE_REFERENCE.md`) and show progress/ETA
  rather than let it look hung.
- **Git identity for commits made by the build**: `Ninja
  <andacover.tv@gmail.com>`, matching the repo owner.
