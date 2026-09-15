# Feature Checklist (acceptance)

Tick every box before a phase is called done. "Sample" = the 20 s sample
project in `samples/`; "Real" = a real 9-minute, 40+-image project.

## Projects & assets
- [ ] Create, rename, duplicate, delete a project
- [ ] Import audio (mp3, wav, m4a, mp4-audio), images (jpg/png/webp), clips (mp4/webm)
- [ ] Export zip → import zip on another browser → identical project.json and media hashes
- [ ] Link a folder (File System Access API) and see files appear; graceful fallback where unsupported
- [ ] Near-duplicate images grouped as variants

## Script → beats
- [ ] Beat split never cuts a sentence; abbreviations ("Mrs. Benn", "Dr.", "St.") handled
- [ ] Sum of beat words == script words (badge shows green)
- [ ] Merge/split beats manually; min/max hold re-split works
- [ ] "Narration starts at beat N" drops earlier beats from timing but keeps them in the script
- [ ] Prompt export numbered to beats (txt + json)

## AI providers
- [ ] Anthropic, OpenAI, Gemini, Ollama, OpenAI-compatible all pass Test
- [ ] Keys encrypted at rest; "forget keys" wipes them; nothing in git or Vercel logs
- [ ] Cost estimate shown before vision calls

## Matching
- [ ] By-number matching for `01_`, `7-`, `12 ` style names
- [ ] AI matching returns complete mapping for Real (42 beats / 80 images) on at least two providers
- [ ] Review grid: J/K, 1–9, Space preview, drag-to-assign, spare toggle
- [ ] Coverage report blocks render until complete (or user allows blank/reuse)

## Timing
- [ ] Proportional timing works with no AI and no transcription
- [ ] Whisper alignment produces word timings; beat starts within ±150 ms on Real
- [ ] Waveform with draggable beat markers; snapping to word boundaries
- [ ] Speed 0.85–1.25× pitch-preserved; all beats recompute; render stays in sync
- [ ] Silence trim, loudness normalise (−16 LUFS) apply to the rendered audio
- [ ] Min/max hold warnings shown and enforced

## Visuals
- [ ] Ken Burns zoom completes exactly at beat end; alternating direction; per-beat override
- [ ] Dissolve/cut/fade-black; global + per-beat
- [ ] B-roll clips trimmed to beat, muted
- [ ] Title card and end card optional and configurable; end card from blurred last frame
- [ ] Captions (optional) from word timings; music with ducking (optional); watermark (optional)
- [ ] 16:9 1080p, 16:9 4K, 9:16, 1:1 presets with focal-point cropping

## Rendering
- [ ] Browser render of Sample completes in headless Chromium in CI; duration exact
- [ ] Browser render of Real completes without UI freeze; progress + ETA; pause/resume/cancel
- [ ] Output plays in VLC, Chrome, and uploads to YouTube without re-encode warnings
- [ ] Verification report: duration, tracks, faststart, SHA-256
- [ ] Preview 720p mode under 1/3 of final render time
- [ ] Incremental re-render only rebuilds changed beats

## Agent (optional)
- [ ] /health, /align, /render, /job, /download work with bearer token
- [ ] Same project → agent render vs browser render cut points within ±1 frame
- [ ] run.bat / run.sh / Docker all start the agent

## Deploy & repo
- [ ] `pnpm i && pnpm dev` works from a clean clone
- [ ] CI green: lint, typecheck, unit, e2e sample render
- [ ] Vercel deploy green; app usable from a different computer with only the URL
- [ ] README explains: run locally, deploy, add a provider, run the agent, privacy model
- [ ] MIT license; CHANGELOG; DECISIONS.md
