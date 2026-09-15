# Narrated Video Assembler

A web app (plus an optional Python render agent) that turns a **voice-over +
script + images/clips** into a finished video with every visual timed
exactly to the narration — no manual timeline editing. Works for any
narrated, image-driven video: book channels, documentaries, explainers,
course lessons, faceless YouTube content, and more.

This repo is being built phase by phase per `docs/build-package/03_BUILD_PROMPTS.md`.
Status: **Phase 0 complete** (build package committed; monorepo scaffold not
yet started).

## What's here right now

- `docs/build-package/` — the full spec: product spec, architecture, build
  prompts, the proven render pipeline reference, the AI provider spec, and
  the acceptance checklist.
- `docs/build-package/reference_code/` — a working Python + ffmpeg
  implementation of the render pipeline (Ken Burns, crossfade tree-merge,
  end card, verification) and the proportional timing engine. This is the
  ground truth the browser renderer and the optional render agent must
  reproduce.

Read `docs/build-package/00_README_START_HERE.md` first — it explains how
the rest of the package fits together and lists the phases.

## License

MIT — see `LICENSE`.
