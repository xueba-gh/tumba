"""ReadersMind Assembler — local control panel.

Run:  python app.py   (or double-click run.bat on Windows)
Then open http://127.0.0.1:8765 in your browser.
"""
import io
import json
import os
import sys
import threading
import time
import traceback
import uuid
import webbrowser

from flask import Flask, jsonify, request, send_file, send_from_directory
from PIL import Image

from assembler import book as bookmod
from assembler import ffmpeg_tools as ff
from assembler import matcher
from assembler.render import Renderer

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")
PORT = 8765

app = Flask(__name__, static_folder=os.path.join(HERE, "static"), static_url_path="/static")

DEFAULT_CONFIG = {
    "root": r"C:\Users\jacob\Videos\READERSMIND",
    "books_subdir": "BOOK - SCRIPTS PER BOOK FOLDER",
    "output_subdir": "FINAL VIDEO OUTPUT",
    "anthropic_api_key": "",
    "model": "claude-sonnet-4-5",
    "tagline": "for more literary deep dives",
    "end_card_seconds": 5,
}


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, encoding="utf-8") as f:
                cfg.update(json.load(f))
        except Exception:
            pass
    return cfg


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


JOBS = {}


class Job:
    def __init__(self):
        self.id = uuid.uuid4().hex[:8]
        self.progress = 0.0
        self.stage = "Queued"
        self.log = []
        self.done = False
        self.error = None
        self.output = None
        self.renderer = None
        self.started = time.time()

    def add(self, line):
        self.log.append(line)
        if len(self.log) > 400:
            self.log = self.log[-400:]

    def to_dict(self):
        return {
            "id": self.id, "progress": self.progress, "stage": self.stage,
            "log": self.log[-80:], "done": self.done, "error": self.error,
            "output": self.output, "elapsed": round(time.time() - self.started),
        }


def _book_dir(cfg, book):
    base = os.path.join(cfg["root"], cfg["books_subdir"])
    path = os.path.abspath(os.path.join(base, book))
    if not path.startswith(os.path.abspath(base)) or not os.path.isdir(path):
        raise ValueError("Unknown book folder")
    return path


def _inside_root(cfg, path):
    root = os.path.abspath(cfg["root"])
    return os.path.abspath(path).startswith(root)


# ------------------------------------------------------------------ routes

@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/status")
def status():
    cfg = load_config()
    return jsonify({
        "ffmpeg": bool(ff.FFMPEG), "ffprobe": bool(ff.FFPROBE),
        "ffmpeg_path": ff.FFMPEG, "root_ok": os.path.isdir(cfg["root"]),
        "has_key": bool(cfg.get("anthropic_api_key")),
    })


@app.get("/api/config")
def get_config():
    cfg = load_config()
    safe = dict(cfg)
    key = safe.get("anthropic_api_key", "")
    safe["anthropic_api_key_masked"] = (key[:7] + "…" + key[-4:]) if len(key) > 12 else ("set" if key else "")
    safe.pop("anthropic_api_key", None)
    return jsonify(safe)


@app.post("/api/config")
def set_config():
    cfg = load_config()
    data = request.get_json(force=True) or {}
    for k in ("root", "books_subdir", "output_subdir", "model", "tagline"):
        if k in data and isinstance(data[k], str):
            cfg[k] = data[k].strip()
    if "end_card_seconds" in data:
        try:
            cfg["end_card_seconds"] = float(data["end_card_seconds"])
        except (TypeError, ValueError):
            pass
    if data.get("anthropic_api_key"):
        cfg["anthropic_api_key"] = data["anthropic_api_key"].strip()
    save_config(cfg)
    return jsonify({"ok": True})


@app.get("/api/books")
def books():
    cfg = load_config()
    base = os.path.join(cfg["root"], cfg["books_subdir"])
    if not os.path.isdir(base):
        return jsonify({"error": f"Folder not found: {base}", "books": []})
    names = sorted(d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d)))
    return jsonify({"books": names, "base": base})


@app.post("/api/scan")
def scan():
    cfg = load_config()
    data = request.get_json(force=True) or {}
    bdir = _book_dir(cfg, data["book"])
    info = bookmod.scan_book(bdir)
    beats = bookmod.load_beats(info)
    narration, nsrc = bookmod.load_narration(info)
    audio = info["audio_candidates"][0] if info["audio_candidates"] else None
    dur = None
    if audio:
        try:
            dur = ff.probe_duration(audio)
        except Exception as e:
            info["warnings"].append(f"Could not read audio: {e}")
    out_dir = os.path.join(cfg["root"], cfg["output_subdir"], info["book_name"])
    out_path = os.path.join(out_dir, info["book_name"] + ".mp4")
    return jsonify({
        "info": info, "beats": beats, "narration_source": nsrc,
        "narration_words": len(narration.split()), "audio": audio, "audio_duration": dur,
        "output": out_path, "output_exists": os.path.exists(out_path),
    })


@app.get("/api/thumb")
def thumb():
    cfg = load_config()
    path = request.args.get("path", "")
    if not path or not _inside_root(cfg, path) or not os.path.isfile(path):
        return ("not found", 404)
    im = Image.open(path).convert("RGB")
    im.thumbnail((360, 360))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=75)
    buf.seek(0)
    return send_file(buf, mimetype="image/jpeg")


@app.post("/api/match")
def match():
    cfg = load_config()
    data = request.get_json(force=True) or {}
    bdir = _book_dir(cfg, data["book"])
    info = bookmod.scan_book(bdir)
    beats = bookmod.load_beats(info)
    strategy = data.get("strategy", "ai")
    mapping = matcher.by_number(info["images"], beats)
    notes = ""
    remaining = [b for b in beats if b["n"] not in mapping]
    if strategy == "ai" and remaining:
        log = []
        try:
            ai_map, notes = matcher.by_ai(
                info["images"], remaining, cfg.get("anthropic_api_key", ""),
                model=cfg.get("model", "claude-sonnet-4-5"), log=log.append)
        except Exception as e:
            return jsonify({"error": str(e), "mapping": {str(k): v for k, v in mapping.items()}})
        mapping.update(ai_map)
    return jsonify({"mapping": {str(k): v for k, v in mapping.items()}, "notes": notes,
                    "unmatched": [b["n"] for b in beats if b["n"] not in mapping]})


@app.post("/api/timing")
def timing():
    cfg = load_config()
    data = request.get_json(force=True) or {}
    bdir = _book_dir(cfg, data["book"])
    info = bookmod.scan_book(bdir)
    beats = bookmod.load_beats(info)
    narration, _ = bookmod.load_narration(info)
    audio = info["audio_candidates"][0]
    dur = ff.probe_duration(audio)
    segs = bookmod.compute_timing(beats, narration, dur, start_row=int(data.get("start_row", 1)))
    return jsonify({"segments": segs, "audio_duration": dur})


@app.post("/api/render")
def render():
    cfg = load_config()
    data = request.get_json(force=True) or {}
    bdir = _book_dir(cfg, data["book"])
    mapping = {int(k): v for k, v in (data.get("mapping") or {}).items()}
    start_row = int(data.get("start_row", 1))
    quality = data.get("quality", "final")
    info = bookmod.scan_book(bdir)
    beats = bookmod.load_beats(info)
    narration, _ = bookmod.load_narration(info)
    if not info["audio_candidates"]:
        return jsonify({"error": "No narration audio found in the book folder."})
    audio = info["audio_candidates"][0]
    dur = ff.probe_duration(audio)
    segs = bookmod.compute_timing(beats, narration, dur, start_row=start_row)
    missing = [s["n"] for s in segs if s["n"] not in mapping or not os.path.isfile(mapping[s["n"]])]
    if missing:
        return jsonify({"error": f"Beats without an image: {missing}"})
    for v in mapping.values():
        if not _inside_root(cfg, v):
            return jsonify({"error": "Image path outside the READERSMIND folder"})

    out_dir = os.path.join(cfg["root"], cfg["output_subdir"], info["book_name"])
    suffix = " (preview)" if quality == "preview" else ""
    out_path = os.path.join(out_dir, info["book_name"] + suffix + ".mp4")
    work = os.path.join(bdir, "_assembler_work" + ("_preview" if quality == "preview" else ""))

    job = Job()
    JOBS[job.id] = job

    def prog(frac, msg):
        job.progress = frac
        job.stage = msg

    def runner():
        try:
            r = Renderer(work, log=job.add, progress=prog, quality=quality)
            job.renderer = r
            job.add(f"Audio: {os.path.basename(audio)} ({dur:.1f}s), {len(segs)} beats")
            r.render(segs, mapping, audio, out_path,
                     end_card_seconds=float(cfg.get("end_card_seconds", 5)),
                     tagline=cfg.get("tagline", "for more literary deep dives"))
            job.output = out_path
            job.add(f"FINISHED: {out_path}")
        except Exception as e:
            job.error = str(e)
            job.add("ERROR: " + str(e))
            job.add(traceback.format_exc()[-1500:])
        finally:
            job.done = True

    threading.Thread(target=runner, daemon=True).start()
    return jsonify({"job": job.id})


@app.get("/api/job/<jid>")
def job_status(jid):
    j = JOBS.get(jid)
    if not j:
        return jsonify({"error": "no such job"}), 404
    return jsonify(j.to_dict())


@app.post("/api/job/<jid>/cancel")
def job_cancel(jid):
    j = JOBS.get(jid)
    if j and j.renderer:
        j.renderer.cancelled = True
    return jsonify({"ok": True})


@app.post("/api/open")
def open_folder():
    cfg = load_config()
    path = (request.get_json(force=True) or {}).get("path", "")
    if path and _inside_root(cfg, path) and os.path.exists(path):
        folder = path if os.path.isdir(path) else os.path.dirname(path)
        if sys.platform.startswith("win"):
            os.startfile(folder)  # type: ignore[attr-defined]
        return jsonify({"ok": True})
    return jsonify({"ok": False})


if __name__ == "__main__":
    url = f"http://127.0.0.1:{PORT}"
    print(f"ReadersMind Assembler running at {url}")
    if "--no-browser" not in sys.argv:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    app.run(host="127.0.0.1", port=PORT, debug=False, threaded=True)
