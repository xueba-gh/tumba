"""Match images to shot-list beats.

Two strategies:
  1. by_number  — filename starts with the beat number (01_..., 02-..., "7 ...")
  2. by_ai      — Claude looks at every image and every beat and returns a mapping
                  (uses the user's own Anthropic API key, stored locally only)
"""
import base64
import io
import json
import os
import re

from PIL import Image

_NUM_RE = re.compile(r"^\s*(\d{1,3})\s*[-_. )\]]")


def by_number(images, beats):
    """Return {beat_n: image_path} for images whose name starts with a number."""
    mapping = {}
    wanted = {b["n"] for b in beats}
    for p in images:
        m = _NUM_RE.match(os.path.basename(p))
        if m:
            n = int(m.group(1))
            if n in wanted and n not in mapping:
                mapping[n] = p
    return mapping


def _thumb_b64(path, max_side=512, quality=70):
    im = Image.open(path)
    im = im.convert("RGB")
    im.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def by_ai(images, beats, api_key, model="claude-sonnet-4-5", log=None):
    """Ask Claude to pick the single best image for every beat.
    Returns ({beat_n: image_path}, notes:str)."""
    try:
        import anthropic
    except ImportError as e:
        raise RuntimeError("The 'anthropic' package is not installed. Run run.bat again.") from e
    if not api_key:
        raise RuntimeError("No Anthropic API key set. Open Settings and paste your key.")
    log = log or (lambda s: None)
    client = anthropic.Anthropic(api_key=api_key)

    content = []
    content.append({"type": "text", "text":
        "You are matching AI-generated illustrations to the beats of a narrated video. "
        "Below are the candidate images, each labelled IMAGE <index>, followed by the list of "
        "beats. Each beat has the script excerpt spoken while it is on screen and the image "
        "prompt that was used to generate its illustration."})
    for i, p in enumerate(images):
        log(f"[match] encoding image {i+1}/{len(images)}")
        content.append({"type": "text", "text": f"IMAGE {i}  (file: {os.path.basename(p)})"})
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                     "data": _thumb_b64(p)}})
    beat_lines = []
    for b in beats:
        beat_lines.append(f"BEAT {b['n']}\n  excerpt: {b['excerpt']}\n  prompt: {b['prompt']}")
    content.append({"type": "text", "text":
        "BEATS:\n\n" + "\n\n".join(beat_lines) +
        "\n\nFor EVERY beat choose the ONE image whose content best depicts that beat's prompt "
        "and excerpt. Prefer the sharpest, most on-prompt variant when several images show the "
        "same scene. Use each image for at most one beat unless there is truly no other "
        "candidate. Reply with ONLY a JSON object of the form "
        '{"matches": {"<beat number>": <image index>, ...}, "notes": "<one line about any weak matches>"} '
        "and nothing else."})

    log(f"[match] asking Claude ({model}) to match {len(images)} images to {len(beats)} beats")
    resp = client.messages.create(
        model=model,
        max_tokens=4000,
        messages=[{"role": "user", "content": content}],
    )
    text = "".join(block.text for block in resp.content if getattr(block, "type", "") == "text")
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise RuntimeError("Claude did not return JSON:\n" + text[:500])
    data = json.loads(m.group(0))
    mapping = {}
    for k, v in data.get("matches", {}).items():
        try:
            n = int(k)
            idx = int(v)
        except (TypeError, ValueError):
            continue
        if 0 <= idx < len(images):
            mapping[n] = images[idx]
    return mapping, data.get("notes", "")
