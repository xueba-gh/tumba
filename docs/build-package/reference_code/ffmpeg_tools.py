"""Thin wrappers around the local ffmpeg / ffprobe binaries."""
import json
import os
import shutil
import subprocess
import sys


def _candidates(name):
    yield name
    if sys.platform.startswith("win"):
        yield name + ".exe"
        # common install spots
        for base in [
            os.environ.get("ProgramFiles", r"C:\Program Files"),
            os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
            os.environ.get("LOCALAPPDATA", ""),
            "C:\\ffmpeg",
        ]:
            if not base:
                continue
            yield os.path.join(base, "ffmpeg", "bin", name + ".exe")
            yield os.path.join(base, "ffmpeg", name + ".exe")
            yield os.path.join(base, name + ".exe")
            yield os.path.join(base, "bin", name + ".exe")


def find_binary(name):
    """Return an absolute path to ffmpeg/ffprobe or None."""
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    local = os.path.join(here, "bin", name + (".exe" if sys.platform.startswith("win") else ""))
    if os.path.isfile(local):
        return local
    for c in _candidates(name):
        p = shutil.which(c)
        if p:
            return p
        if os.path.isfile(c):
            return c
    return None


FFMPEG = find_binary("ffmpeg")
FFPROBE = find_binary("ffprobe")


class FFmpegMissing(RuntimeError):
    pass


def require():
    if not FFMPEG or not FFPROBE:
        raise FFmpegMissing(
            "ffmpeg/ffprobe not found. Install ffmpeg (https://www.gyan.dev/ffmpeg/builds/) "
            "and either add its bin folder to PATH or copy ffmpeg.exe + ffprobe.exe into the "
            "app's 'bin' folder."
        )


def run(args, log=None, check=True):
    """Run ffmpeg/ffprobe with args (list). Streams stderr lines to log(cb)."""
    require()
    creation = 0
    if sys.platform.startswith("win"):
        creation = subprocess.CREATE_NO_WINDOW  # type: ignore[attr-defined]
    proc = subprocess.Popen(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=creation,
    )
    tail = []
    for line in proc.stdout:  # type: ignore[union-attr]
        line = line.rstrip("\r\n")
        tail.append(line)
        if len(tail) > 60:
            tail.pop(0)
        if log:
            log(line)
    proc.wait()
    if check and proc.returncode != 0:
        raise RuntimeError("ffmpeg failed:\n" + "\n".join(tail[-25:]))
    return proc.returncode


def probe_duration(path):
    require()
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True,
    ).stdout.strip()
    return float(out)


def probe_streams(path):
    require()
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-show_streams", "-of", "json", path],
        capture_output=True, text=True,
    ).stdout
    return json.loads(out or "{}").get("streams", [])


def has_audio(path):
    return any(s.get("codec_type") == "audio" for s in probe_streams(path))


def has_video(path):
    return any(s.get("codec_type") == "video" for s in probe_streams(path))
