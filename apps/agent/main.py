"""
Narrated Video Assembler — Render & Alignment Agent

FastAPI server on 127.0.0.1:8765 (configurable).

Security:
  - Bearer-token auth from config.json
  - CORS restricted to configured origins (not *)
  - All file I/O sandboxed to WORKSPACE_DIR

Endpoints:
  GET  /health              — liveness check
  POST /align               — word-level alignment (requires faster-whisper)
  POST /render              — submit a render job (project zip)
  GET  /job/{id}            — poll job status
  GET  /download/{id}       — download completed render
"""

import os
import json
import uuid
import shutil
import asyncio
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# ---- Configuration ----

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")


def load_config() -> dict:
    """Load config.json next to this file.  Falls back to safe defaults."""
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)
    return {
        "token": None,
        "origins": ["http://localhost:3000"],
        "workspace": os.path.join(os.path.dirname(__file__), "workspace"),
    }


CONFIG = load_config()
AUTH_TOKEN: Optional[str] = CONFIG.get("token")
ALLOWED_ORIGINS: list[str] = CONFIG.get("origins", ["http://localhost:3000"])
WORKSPACE_DIR = os.path.abspath(CONFIG.get("workspace", os.path.join(os.path.dirname(__file__), "workspace")))
JOBS_DIR = os.path.join(WORKSPACE_DIR, "jobs")
os.makedirs(JOBS_DIR, exist_ok=True)

# ---- App setup ----

app = FastAPI(title="Narrated Video Assembler — Render Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# ---- Auth middleware ----


async def verify_token(request: Request) -> None:
    """Check Bearer token on all non-health endpoints."""
    if not AUTH_TOKEN:
        return  # Auth disabled when no token is configured.
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    if auth[7:] != AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid bearer token")


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Health endpoint is always public.
    if request.url.path == "/health":
        return await call_next(request)
    await verify_token(request)
    return await call_next(request)


# ---- Sandboxing ----


def safe_path(base: str, *parts: str) -> str:
    """Resolve a path within the workspace, rejecting traversal attempts."""
    result = os.path.normpath(os.path.join(base, *parts))
    if not result.startswith(os.path.normpath(base)):
        raise HTTPException(status_code=400, detail="Path traversal attempt blocked")
    return result


# ---- In-memory job tracking ----

jobs_db: Dict[str, Dict[str, Any]] = {}

# ---- Endpoints ----


@app.get("/health")
async def health():
    whisper_available = False
    try:
        import faster_whisper  # noqa: F401

        whisper_available = True
    except ImportError:
        pass

    return {
        "status": "ok",
        "version": "1.0.0",
        "agent": "Narrated Video Assembler Agent",
        "whisper": whisper_available,
        "workspace": WORKSPACE_DIR,
        "auth_required": AUTH_TOKEN is not None,
    }


@app.post("/align")
async def align_audio(script: str = Form(...), audio: UploadFile = File(...)):
    """
    Word-level alignment of narration audio against the script.

    Attempts to use faster-whisper for real transcription and alignment.
    Returns an error with guidance if faster-whisper is not installed,
    rather than silently faking timings.
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail=(
                "Word-level alignment requires faster-whisper. "
                "Install it with: pip install faster-whisper\n"
                "Then restart the agent.  In the meantime, use proportional "
                "timing in the web app (it works without an agent)."
            ),
        )

    # Save audio to a temp file in the workspace.
    align_dir = safe_path(WORKSPACE_DIR, "align", f"align-{uuid.uuid4().hex[:8]}")
    os.makedirs(align_dir, exist_ok=True)

    audio_path = safe_path(align_dir, "audio" + os.path.splitext(audio.filename or ".wav")[1])
    with open(audio_path, "wb") as f:
        shutil.copyfileobj(audio.file, f)

    try:
        # Use the "small" model for a good accuracy/speed trade-off.
        model = WhisperModel("small", device="auto", compute_type="auto")
        segments_iter, info = model.transcribe(
            audio_path,
            word_timestamps=True,
            language="en",
        )

        word_timings = []
        for segment in segments_iter:
            if segment.words:
                for w in segment.words:
                    word_timings.append({
                        "word": w.word.strip(),
                        "start": round(w.start, 3),
                        "end": round(w.end, 3),
                    })

        return {
            "status": "aligned",
            "wordTimings": word_timings,
            "language": info.language,
            "duration": info.duration,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Whisper alignment failed: {e}")
    finally:
        # Clean up temp files.
        shutil.rmtree(align_dir, ignore_errors=True)


def run_render_task(job_id: str, zip_path: str):
    """Background task: extract project zip, render, store output."""
    job_dir = safe_path(JOBS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    jobs_db[job_id]["status"] = "rendering"
    jobs_db[job_id]["progress"] = 10

    try:
        # Extract zip contents.
        shutil.unpack_archive(zip_path, job_dir)
        proj_path = os.path.join(job_dir, "project.json")

        if not os.path.exists(proj_path):
            jobs_db[job_id]["status"] = "failed"
            jobs_db[job_id]["error"] = "project.json missing in project zip"
            return

        jobs_db[job_id]["progress"] = 30

        # TODO: Implement real ffmpeg-based render using the reference pipeline.
        # For now, create a placeholder output to prove the job lifecycle works.
        output_mp4 = os.path.join(job_dir, "output.mp4")
        jobs_db[job_id]["progress"] = 50

        with open(proj_path, "r") as f:
            _project = json.load(f)

        # Placeholder: in production this would invoke the ffmpeg pipeline
        # from reference_code/render.py.
        with open(output_mp4, "wb") as f:
            f.write(b"FTYP_MP42_HEADER_PLACEHOLDER_RENDER")

        # Compute SHA-256 of the output.
        sha256 = hashlib.sha256()
        with open(output_mp4, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)

        jobs_db[job_id]["status"] = "completed"
        jobs_db[job_id]["progress"] = 100
        jobs_db[job_id]["output_path"] = output_mp4
        jobs_db[job_id]["sha256"] = sha256.hexdigest()

    except Exception as e:
        jobs_db[job_id]["status"] = "failed"
        jobs_db[job_id]["error"] = str(e)


@app.post("/render")
async def render_project(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    job_id = f"job-{uuid.uuid4().hex[:8]}"
    job_dir = safe_path(JOBS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    zip_path = safe_path(job_dir, "project.zip")
    with open(zip_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    jobs_db[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "created_at": str(asyncio.get_event_loop().time()),
    }

    background_tasks.add_task(run_render_task, job_id, zip_path)
    return {"job_id": job_id, "status": "queued"}


@app.get("/job/{job_id}")
async def get_job_status(job_id: str):
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
    # Don't leak internal paths.
    info = {k: v for k, v in jobs_db[job_id].items() if k != "output_path"}
    return info


@app.get("/download/{job_id}")
async def download_job(job_id: str):
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs_db[job_id]
    if job.get("status") != "completed" or not job.get("output_path"):
        raise HTTPException(status_code=400, detail="Job not completed")
    output_path = job["output_path"]
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Output file not found")
    return FileResponse(
        output_path,
        media_type="video/mp4",
        filename=f"render_{job_id}.mp4",
    )


if __name__ == "__main__":
    import uvicorn

    host = CONFIG.get("host", "127.0.0.1")
    port = CONFIG.get("port", 8765)
    uvicorn.run("main:app", host=host, port=port, reload=True)
