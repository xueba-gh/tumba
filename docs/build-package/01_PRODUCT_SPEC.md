# Product Spec — Narrated Video Assembler

## One-line
A web app (plus optional desktop render agent) that takes a **voice-over**, a
**script**, and a set of **images and/or video clips**, and produces a finished
video where every visual is on screen at exactly the moment the narration is
talking about it — with no manual timeline editing.

## Who it's for
Anyone producing narrated, image-driven videos: book/literature channels,
history and documentary explainers, faceless YouTube channels, course lessons,
audiobook-style storytelling, sermons, product explainers, podcasts-to-video.
Nothing in the app assumes a genre.

## The core promise
1. **Perfect pacing.** Visual changes are locked to the words. The user never
   drags clips on a timeline.
2. **Zero manual matching.** The AI (any provider) decides which image belongs
   to which sentence; the user reviews and overrides with one click.
3. **Work from anywhere.** Runs at a URL. Renders in the browser. Optional
   desktop/cloud agent for heavy jobs. Everything is a git repo the user owns.
4. **Quality first.** 1080p/4K H.264, calm Ken Burns motion, clean dissolves,
   verified output (no dropped frames, no A/V drift).

---

## Feature list (complete)

### A. Projects & assets
- A **project** = one video. Stored as a folder-like structure: `project.json`
  (everything about the video) + media. Projects live in the browser's
  storage (OPFS) and can be **exported/imported as a single .zip** or synced to
  a folder via the File System Access API, so the user can move between
  computers or keep them in Dropbox/Drive/GitHub LFS.
- Import: drag-and-drop or folder picker for **audio** (mp3/wav/m4a/mp4/aac/ogg),
  **images** (jpg/png/webp), **video clips** (mp4/webm/mov — used as b-roll
  segments), and **script** (txt/md/docx paste).
- Detect duplicates and variants (same concept, different generation).
- Per-asset metadata: caption/prompt (if the image bot wrote one), tags,
  "used in beat N", "spare".

### B. Script → beats (the timing skeleton)
- Paste or import the script. The app splits it into **beats** (sentence-level
  groups, target 20–40 words, never splitting a sentence, abbreviation-aware).
  Word count of all beats must equal the script's word count — verified.
- User can **merge/split beats**, set a **minimum and maximum seconds per
  image** (e.g. "never hold one image longer than 15 s"), and the app re-splits
  to honour it.
- Each beat holds: text, an optional **image prompt** (AI-written or user-
  written), type (image / clip / title card / blank), and later its timing.
- Bracketed voice cues like `[pause]` `[sigh]` are kept for the TTS text but
  ignored for timing.
- **Script analysis** (AI, optional): suggest beats, write image prompts in a
  chosen visual style, flag beats that need two images, propose a title/hook.

### C. Narration timing (the heart)
- **Word-level alignment**: the app transcribes the voice-over with
  Whisper (in-browser via `transformers.js` / `whisper-web`, or on the render
  agent with `faster-whisper`) and aligns the transcript to the script to get
  the exact start time of every beat. This is the accurate mode.
- **Proportional fallback**: if transcription is skipped, start times are
  estimated from each beat's character offset in the script (the method used
  in the reference pipeline). Always available, no AI needed.
- **Audio doesn't start at word one?** (e.g. a hook paragraph was added after
  recording.) The alignment detects the first spoken beat automatically; the
  user can also set "narration starts at beat N".
- **Manual nudge**: every beat's start can be dragged ± on a waveform strip.
- **Voice-over pace control**: change narration speed (0.85×–1.25×) with
  pitch preserved (rubberband/atempo), and the whole visual schedule
  recomputes automatically. Also: trim leading/trailing silence, normalise
  loudness to −16 LUFS, optional gentle noise gate.
- **Image pace rules**: min/max hold per image, "no image longer than X s",
  "prefer a new image at every sentence", and "extend the last image to the
  end of audio".

### D. Image ↔ beat matching
- **By filename number** (`01_…`, `07-…`): instant, deterministic.
- **By AI vision**: send thumbnails of all candidates + all beats to the chosen
  provider; get back one image per beat plus confidence and notes. Works with
  Anthropic, OpenAI, Gemini, Ollama (llava/qwen-vl), or any OpenAI-compatible
  vision endpoint.
- **Review grid**: beat text on the left, chosen image on the right, thumbnails
  of the alternates below; click to swap; drag any image onto any beat; "mark
  as spare".
- **Coverage report**: beats without an image, images never used, duplicates
  chosen twice — nothing renders until coverage is 100 % (or the user allows
  a beat to reuse/blank).
- **Prompt export**: one click produces the list of prompts for the user's
  image generator, numbered to match beats, in the project's visual style.

### E. Visual treatment
- **Ken Burns** per image: subtle zoom (3–6 %) and/or pan; direction alternates;
  motion completes exactly at the beat's end; per-beat override (zoom in / out /
  pan L→R / none).
- **Transitions**: dissolve (default, 0.3–0.8 s), cut, fade-through-black. One
  global setting with per-beat override. No gimmicks.
- **B-roll clips**: trimmed to the beat, optionally slowed, audio muted.
- **Title card** at the start (optional) and **end card** (text, e.g.
  SUBSCRIBE + tagline; built from a blurred, darkened last frame, or a solid
  colour, or a user image). Both fully optional.
- **Captions**: optional burned-in captions from the word-level alignment
  (off by default), with a simple style picker.
- **Background music**: optional track with auto-ducking under narration
  (off by default — some users add music elsewhere).
- **Aspect presets**: 16:9 1080p, 16:9 4K, 9:16 vertical (Shorts/Reels), 1:1.
  Images are scale-to-cover-and-crop with a focal-point picker.
- **Watermark/logo** corner overlay (optional).

### F. Rendering
- **In-browser renderer** (primary): canvas drawing per frame → WebCodecs
  `VideoEncoder` (H.264, hardware) → `mp4-muxer` → File System Access API save.
  Progress bar with frames/sec and ETA; pause/resume; runs in a Web Worker
  with OffscreenCanvas so the UI stays responsive.
- **Preview render**: 720p, fast preset, for checking pacing in a minute.
- **Render agent** (optional, Python + ffmpeg): same project.json, same output.
  The web app can send a job to an agent by URL (local `http://127.0.0.1:8765`
  or a cloud box), watch progress, and download the result. Agent also does
  `faster-whisper` alignment when the browser is too slow.
- **Verification** after every render: decode-through check, duration ==
  audio + cards, no non-monotonic timestamps, faststart moov, SHA-256 shown.

### G. AI providers (see 05_AI_PROVIDER_SPEC.md)
- Settings page: pick a provider for **vision/matching** and (separately) for
  **text/script tasks**; enter base URL + key + model name; test button.
- Supported out of the box: Anthropic, OpenAI, Google Gemini, Ollama, LM
  Studio / any OpenAI-compatible URL, OpenRouter.
- Keys stored client-side (WebCrypto-encrypted in IndexedDB, unlock with a
  passphrase) or in the agent's `config.json`. Never sent anywhere except the
  provider. Never committed.
- Cost/usage estimate shown before any AI call that sends images.

### H. Productivity
- **Batch mode**: queue several projects; render them one after another.
- **Templates**: save a project's style (transition, Ken Burns, end card,
  aspect, prompts style) as a template; new projects start from it.
- **Keyboard-first review**: J/K to move between beats, 1–9 to pick an
  alternate, Space to preview the beat with audio.
- **Beat preview**: play just that beat's audio with its image and motion.
- **Change log** inside project.json so a re-render after tweaks only rebuilds
  the affected clips (cache by content hash).
- **Export**: MP4, plus a `timeline.json`/EDL/SRT for people who want to
  finish in CapCut/Premiere.

### I. Non-functional
- Everything works offline after first load except AI calls.
- No account required. No server-side storage of user media.
- Repo is MIT-licensed, one `pnpm dev` to run, one click to deploy on Vercel.
- Unit tests for beat splitting, timing math, and renderer duration accuracy;
  an end-to-end test that renders a 20-second sample and checks its duration.

---

## Acceptance criteria (must all pass)
1. Import 1 audio + 40 images + script → beats generated, word count verified.
2. Alignment mode produces beat start times within ±150 ms of a human-marked
   reference on a 9-minute sample.
3. AI matching with each of Anthropic, OpenAI, Gemini, and Ollama returns a
   complete mapping for 42 beats from 80 candidate images; review grid lets me
   override any beat in one click.
4. In-browser render of a 9-minute 1080p project finishes without the tab
   freezing, output duration = audio + end card ± 0.1 s, plays in VLC, Chrome,
   and YouTube upload.
5. Changing narration speed to 1.1× recomputes every beat and the render still
   lines up.
6. Export project zip on one computer, import on another, render identically.
7. Same project.json rendered by the Python agent matches the browser render's
   segment timings (not bit-identical video, but same cut points ±1 frame).
8. `pnpm test` green; Vercel deploy green; no key ever appears in git history.
