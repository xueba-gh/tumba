"""Discover a book folder's assets and parse the shot list + narration."""
import json
import os
import re

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".mp4", ".flac", ".ogg", ".opus"}


def _walk(root):
    for dirpath, dirnames, filenames in os.walk(root):
        # never descend into our own work folders
        dirnames[:] = [d for d in dirnames if not d.startswith("_assembler")]
        for f in filenames:
            yield os.path.join(dirpath, f)


def scan_book(book_dir):
    """Return dict describing what we found in the book folder."""
    info = {
        "book_dir": book_dir,
        "book_name": os.path.basename(book_dir.rstrip("\\/")),
        "shot_list": None,
        "shot_list_json": None,
        "long_form_script": None,
        "tts_sections": None,
        "narration_txt": None,
        "audio_candidates": [],
        "images": [],
        "warnings": [],
    }
    for p in _walk(book_dir):
        name = os.path.basename(p)
        low = name.lower()
        ext = os.path.splitext(low)[1]
        if low.endswith("shot list.md") or low.endswith("shotlist.md"):
            info["shot_list"] = p
        elif low == "shotlist.json":
            info["shot_list_json"] = p
        elif "long form script" in low and low.endswith(".md") and "human style" not in low:
            info["long_form_script"] = p
        elif low.endswith("tts sections.md"):
            info["tts_sections"] = p
        elif low == "narration.txt":
            info["narration_txt"] = p
        elif ext in IMAGE_EXT:
            info["images"].append(p)
        elif ext in AUDIO_EXT:
            # audio lives at the book root (e.g. "woman in white.mp4"); skip our outputs
            rel = os.path.relpath(p, book_dir)
            if os.sep not in rel and "final" not in low:
                info["audio_candidates"].append(p)
    info["images"].sort()
    info["audio_candidates"].sort(key=lambda p: -os.path.getsize(p))
    if not info["shot_list"] and not info["shot_list_json"]:
        info["warnings"].append("No '<Book> - Shot List.md' found in the book folder.")
    if not info["audio_candidates"]:
        info["warnings"].append("No narration audio found at the book folder root.")
    if not info["images"]:
        info["warnings"].append("No images found.")
    return info


# ---------------------------------------------------------------- shot list

_ROW_RE = re.compile(r"^\|\s*(\d+)\s*\|(.*)\|\s*(IMAGE|B-ROLL|BROLL|VIDEO)\s*\|(.*)\|\s*$", re.I)


def parse_shot_list_md(path):
    """Parse the markdown table. Returns list of beats:
    {"n": int, "excerpt": str, "type": "IMAGE", "prompt": str}"""
    beats = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = _ROW_RE.match(line.strip())
            if not m:
                continue
            n = int(m.group(1))
            excerpt = m.group(2).strip().strip('"').strip("“”").strip()
            typ = m.group(3).upper().replace("BROLL", "B-ROLL")
            prompt = m.group(4).strip()
            beats.append({"n": n, "excerpt": excerpt, "type": typ, "prompt": prompt})
    beats.sort(key=lambda b: b["n"])
    return beats


def load_beats(info):
    if info.get("shot_list_json"):
        with open(info["shot_list_json"], encoding="utf-8") as f:
            data = json.load(f)
        return data["beats"] if isinstance(data, dict) else data
    if info.get("shot_list"):
        return parse_shot_list_md(info["shot_list"])
    return []


# ---------------------------------------------------------------- narration

def _clean_tags(text):
    # remove ElevenLabs-style bracket cues like [pause], [sigh], [Thoughtful]
    return re.sub(r"\[[^\]]{1,30}\]", "", text)


def extract_full_narration(md_path):
    """Pull the 'Full narration' section out of a Long Form Script .md."""
    with open(md_path, encoding="utf-8") as f:
        text = f.read()
    # find a heading containing 'full narration'
    m = re.search(r"^#{1,6}\s*.*full narration.*$", text, re.I | re.M)
    if m:
        body = text[m.end():]
        # stop at next heading of same-or-higher level
        m2 = re.search(r"^#{1,6}\s+\S", body, re.M)
        if m2:
            body = body[: m2.start()]
    else:
        body = text
    body = body.strip()
    return body


def load_narration(info):
    """Return (narration_text, source_path)."""
    if info.get("narration_txt"):
        with open(info["narration_txt"], encoding="utf-8") as f:
            return f.read().strip(), info["narration_txt"]
    if info.get("tts_sections"):
        # TTS Sections is exactly what was recorded — best source
        with open(info["tts_sections"], encoding="utf-8") as f:
            text = f.read()
        text = re.sub(r"^#{1,6}\s*Section\s*\d+.*$", "", text, flags=re.I | re.M)
        text = re.sub(r"^#{1,6}.*$", "", text, flags=re.M)
        return re.sub(r"\n{3,}", "\n\n", text).strip(), info["tts_sections"]
    if info.get("long_form_script"):
        return extract_full_narration(info["long_form_script"]), info["long_form_script"]
    return "", None


def _norm(s):
    s = _clean_tags(s)
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("—", "-").replace("–", "-").replace("…", "...")
    return re.sub(r"\s+", " ", s).strip()


def compute_timing(beats, narration, audio_duration, start_row=1):
    """Proportional anchor timing: each beat starts where its excerpt's first
    words appear in the narration (character offset / total chars * duration).
    Returns list of {"n", "start", "dur", "found": bool}. Beats before start_row
    are dropped (used when the recorded audio skips a hook paragraph)."""
    text = _norm(narration)
    total = len(text) or 1
    use = [b for b in beats if b["n"] >= start_row]
    offsets = []
    last = 0
    for b in use:
        anchor_full = _norm(b["excerpt"])
        # excerpts may contain '...' (elided) — use the part before it
        anchor = anchor_full.split("...")[0].strip()
        found = False
        idx = -1
        for length in (60, 40, 25, 15):
            a = anchor[:length].strip()
            if len(a) < 8:
                continue
            idx = text.find(a, max(0, last - 5))
            if idx != -1:
                found = True
                break
        if idx == -1:
            idx = last
        offsets.append((b, idx, found))
        last = idx
    # if the recorded audio starts at the first used beat, rebase offsets so
    # the first beat sits at 0 and later beats scale over the remaining text.
    first_off = offsets[0][1] if offsets else 0
    span = total - first_off if total - first_off > 0 else total
    segs = []
    for i, (b, off, found) in enumerate(offsets):
        t = (off - first_off) / span * audio_duration
        if i == 0:
            t = 0.0
        segs.append({"n": b["n"], "start": round(max(0.0, t), 3), "found": found})
    for i, s in enumerate(segs):
        nxt = segs[i + 1]["start"] if i + 1 < len(segs) else audio_duration
        s["dur"] = round(max(0.05, nxt - s["start"]), 3)
    return segs
