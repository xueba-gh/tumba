# User Guide — Narrated Video Assembler

**Narrated Video Assembler** turns any voice-over narration, script, and set of images/clips into a finished video perfectly locked to the narration.

---

## 🚀 Quick Start Guide (5 Minutes)

### 1. Launch the Web App
Run `pnpm dev` in your terminal and open [http://localhost:3000](http://localhost:3000).

### 2. Configure AI Providers (Settings Page)
- Navigate to **Settings** (`/settings`).
- Select your AI provider (Anthropic, OpenAI, Google Gemini, Ollama, OpenRouter, or OpenAI-compatible).
- Paste your API Key and Model Name (e.g. `claude-sonnet-4-5`, `gpt-4o`, `gemini-2.0-flash`, `llava:13b`).
- Click **Test** to verify connection.

### 3. Create a Project
- On the **Projects** page (`/`), click **+ New Project**.
- Choose your project name and aspect ratio:
  - `16:9 Landscape` (YouTube / Desktop)
  - `9:16 Vertical` (Shorts / TikTok / Reels)
  - `1:1 Square` (Instagram)

### 4. Step 1 — Import Media & Script (`/p/[id]/import`)
- Drag and drop your **Audio** (`.mp3`, `.wav`), **Images** (`.jpg`, `.png`, `.webp`), **Video Clips** (`.mp4`), and **Script** (`.txt`, `.md`).
- Inspect audio waveform peaks and listen to voice-over audio.
- View near-duplicate image variant badges (`⚠️ Variant (94% match)`) calculated via 64-bit perceptual hashing.
- Toggle **Spare** for backup images.

### 5. Step 2 — Script to Beats (`/p/[id]/script`)
- Click **⚡ Split Script into Beats**.
- Verify the **✓ Verified Word Count Badge** confirming script words match total beat words.
- Click **✨ Rewrite All Image Prompts** to generate visual prompts using your configured AI model.
- Click **Export Prompts** to download prompts for Midjourney / Flux / SD as `.txt` or `.json`.

### 6. Step 3 — Match Grid (`/p/[id]/match`)
- Click **🔢 Match by Number** to map files starting with numbers (e.g., `01_scene.png` -> Beat 1).
- Or click **👁️ Match by AI Vision** to automatically match images to beats with Vision AI.
- Use keyboard shortcuts to review:
  - `J` / `↓`: Next beat
  - `K` / `↑`: Previous beat
  - `1`–`9`: Assign candidate image 1-9 to selected beat
  - `Space`: Audition audio
  - Or drag and drop candidate image cards directly onto beat cards!

### 7. Step 4 — Narration Timing (`/p/[id]/timing`)
- Inspect beat cut markers along the audio waveform timeline.
- Adjust **Narration Speed Slider** (0.85× – 1.25×).
- Click **▶ Audition Beat** to preview any beat's audio.

### 8. Step 5 — Visual Style (`/p/[id]/style`)
- Set transition style (`dissolve`, `cut`, `fadeblack`) and duration.
- Adjust Ken Burns motion zoom intensity sliders.
- Enable **End Card** (Title e.g. SUBSCRIBE, tagline, duration).

### 9. Step 6 — Render Video (`/p/[id]/render`)
- Click **🎬 Render Video in Browser**.
- Watch real-time encoding progress, FPS, and ETA.
- Preview rendered MP4 video in the built-in video player.
- Click **💾 Download MP4 Video**.
- Export EDL (`.edl`) or Subtitles (`.srt`).

---

## 🛠 Optional Desktop Render Agent

Run the optional Python render agent for batch processing or heavy jobs:
```bash
cd apps/agent
run.bat
```
The agent starts on `http://127.0.0.1:8765`.
