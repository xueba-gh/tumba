# Render & Alignment Agent

Optional Python 3.11+ FastAPI agent for server-side rendering and Whisper alignment.

## Quick Start

```bash
# 1. Copy the example config and set your bearer token
cp config.example.json config.json
# Edit config.json: set "token" to a random secret

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run
python main.py
# or
./run.bat   # Windows
```

## Configuration

Edit `config.json` (never committed — in .gitignore):

| Key | Description | Default |
|-----|-------------|---------|
| `token` | Bearer token for auth. Set to `null` to disable auth. | `null` |
| `origins` | Allowed CORS origins | `["http://localhost:3000"]` |
| `workspace` | Directory for job files (sandboxed) | `./workspace` |
| `host` | Bind address | `127.0.0.1` |
| `port` | Listen port | `8765` |

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Liveness check, reports Whisper availability |
| `POST` | `/align` | Yes | Word-level alignment via faster-whisper |
| `POST` | `/render` | Yes | Submit a render job (project zip) |
| `GET` | `/job/{id}` | Yes | Poll job status and progress |
| `GET` | `/download/{id}` | Yes | Download completed MP4 |

## Whisper Alignment

To enable real word-level alignment, install faster-whisper:

```bash
pip install faster-whisper
```

The first call will download the `small` model (~461 MB). Without faster-whisper,
the `/align` endpoint returns a clear error suggesting proportional timing
as a fallback.

## Security

- **Auth**: All endpoints except `/health` require `Authorization: Bearer <token>`.
- **CORS**: Only configured origins are allowed (no wildcard `*`).
- **Sandboxing**: All file operations are confined to the `workspace` directory.
  Path traversal attempts are rejected.
- **Keys**: The `config.json` file should have restricted permissions (`chmod 600` on Unix).
