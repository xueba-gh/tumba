# Reference implementation (Python + ffmpeg)

A working, tested version of the render pipeline and the proportional timing
engine, plus a minimal local control panel. It is the ground truth for the
render agent (apps/agent) and for the behaviour the browser renderer must
reproduce. It was written for one specific folder layout (a "book" folder with
audio at the root, `images/`, and a markdown shot list); the real app
generalises all of that behind `project.json`.

Files
- `ffmpeg_tools.py` — find/run ffmpeg & ffprobe, probe durations.
- `book.py` — scan a folder for assets; parse a markdown shot-list table;
  extract narration text; `compute_timing()` (proportional anchors).
- `matcher.py` — match images to beats by filename number, or by AI vision
  (Anthropic adapter; generalise per 05_AI_PROVIDER_SPEC.md).
- `render.py` — `Renderer`: Ken Burns clips, crossfade **tree merge**, audio
  mux, end card, concat, verify. Copy the constants exactly.
- `app.py` — Flask control panel (scan → match → timing → render with progress).

Run standalone (desktop with ffmpeg on PATH):
```
pip install flask pillow anthropic
python app.py          # opens http://127.0.0.1:8765
```
