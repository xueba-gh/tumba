"""The rendering pipeline: Ken Burns clips -> crossfade tree-merge -> audio mux
-> end card -> concat -> verify. Mirrors the pipeline used in the sandbox builds."""
import os
import shutil
import sys

from . import ffmpeg_tools as ff

W, H, FPS = 1920, 1080, 30
T = 0.5  # crossfade seconds


def _q(path):
    """Path for use inside ffmpeg filter args / concat lists (forward slashes,
    escaped colon and quotes)."""
    p = path.replace("\\", "/")
    p = p.replace(":", "\\:").replace("'", "\\'")
    return p


class Renderer:
    def __init__(self, work_dir, log=None, progress=None, quality="final"):
        self.work = work_dir
        os.makedirs(work_dir, exist_ok=True)
        self.log = log or (lambda s: None)
        self.progress = progress or (lambda frac, msg: None)
        self.quality = quality  # "final" or "preview"
        self.cancelled = False

    # ---------------------------------------------------------------- clips
    def _clip_len(self, segs, i):
        return segs[i]["dur"] + (T if i < len(segs) - 1 else 0.0)

    def make_clip(self, img, out, render_dur, n):
        zoom_target = 1.04 if n % 2 == 1 else 1.035
        frames = max(int(round(render_dur * FPS)), 1)
        zinc = (zoom_target - 1.0) / frames
        if self.quality == "preview":
            src_scale = "scale=1920:1080"
            preset, crf = "ultrafast", 26
        else:
            src_scale = "scale=3840:2160"
            preset, crf = "veryfast", 18
        vf = (
            f"{src_scale}:force_original_aspect_ratio=increase,"
            f"crop={'3840:2160' if self.quality != 'preview' else '1920:1080'},"
            f"zoompan=z='min(zoom+{zinc:.8f},{zoom_target})':d=1:"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS},"
            f"format=yuv420p"
        )
        ff.run([
            ff.FFMPEG, "-y", "-loop", "1", "-i", img, "-t", f"{render_dur:.3f}",
            "-vf", vf, "-r", str(FPS), "-c:v", "libx264", "-preset", preset,
            "-crf", str(crf), "-an", out,
        ])
        actual = ff.probe_duration(out)
        if abs(actual - render_dur) > 0.25:
            raise RuntimeError(f"clip {n} came out {actual:.2f}s, expected {render_dur:.2f}s")

    def build_clips(self, segs, image_for):
        clips = []
        n_total = len(segs)
        for i, s in enumerate(segs):
            if self.cancelled:
                raise RuntimeError("cancelled")
            out = os.path.join(self.work, f"clip_{i:02d}.mp4")
            rl = self._clip_len(segs, i)
            need = True
            if os.path.exists(out):
                try:
                    if abs(ff.probe_duration(out) - rl) <= 0.25:
                        need = False
                except Exception:
                    need = True
            if need:
                self.log(f"[clip {i+1}/{n_total}] beat {s['n']} — {rl:.2f}s")
                self.make_clip(image_for[s["n"]], out, rl, s["n"])
            clips.append({"path": out, "len": rl})
            self.progress(0.05 + 0.55 * (i + 1) / n_total, f"Rendering image {i+1} of {n_total}")
        return clips

    # ---------------------------------------------------------------- merge
    def merge_pair(self, left, right, out):
        offset = left["len"] - T
        new_len = offset + right["len"]
        fc = f"[0:v][1:v]xfade=transition=dissolve:duration={T}:offset={offset:.3f}[v]"
        ff.run([
            ff.FFMPEG, "-y", "-i", left["path"], "-i", right["path"],
            "-filter_complex", fc, "-map", "[v]", "-c:v", "libx264",
            "-preset", "veryfast" if self.quality != "preview" else "ultrafast",
            "-crf", "18" if self.quality != "preview" else "26",
            "-pix_fmt", "yuv420p", out,
        ])
        actual = ff.probe_duration(out)
        if abs(actual - new_len) > 0.5:
            raise RuntimeError(f"merge produced {actual:.2f}s, expected {new_len:.2f}s")
        return {"path": out, "len": new_len}

    def tree_merge(self, items):
        level = 0
        total_levels = max(1, (len(items) - 1).bit_length())
        while len(items) > 1:
            level += 1
            nxt = []
            pairs = len(items) // 2
            for i in range(pairs):
                if self.cancelled:
                    raise RuntimeError("cancelled")
                out = os.path.join(self.work, f"L{level}_{i:03d}.mp4")
                self.log(f"[merge L{level}] {i+1}/{pairs}")
                nxt.append(self.merge_pair(items[2 * i], items[2 * i + 1], out))
                self.progress(0.60 + 0.25 * (level - 1 + (i + 1) / pairs) / total_levels,
                              f"Blending transitions (pass {level})")
            if len(items) % 2:
                nxt.append(items[-1])
            items = nxt
        return items[0]

    # ---------------------------------------------------------------- audio / end card
    def mux(self, video, audio, out):
        self.log("[mux] adding narration audio")
        ff.run([
            ff.FFMPEG, "-y", "-i", video["path"], "-i", audio, "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", out,
        ])
        return out

    def _font(self):
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        local = os.path.join(here, "fonts")
        for name in ("DejaVuSerif-Bold.ttf", "DejaVuSerif.ttf"):
            p = os.path.join(local, name)
            if os.path.isfile(p):
                bold = os.path.join(local, "DejaVuSerif-Bold.ttf")
                reg = os.path.join(local, "DejaVuSerif.ttf")
                return (bold if os.path.isfile(bold) else p, reg if os.path.isfile(reg) else p)
        if sys.platform.startswith("win"):
            fdir = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
            bold = os.path.join(fdir, "georgiab.ttf")
            reg = os.path.join(fdir, "georgia.ttf")
            if os.path.isfile(bold) and os.path.isfile(reg):
                return bold, reg
            return os.path.join(fdir, "timesbd.ttf"), os.path.join(fdir, "times.ttf")
        return ("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf")

    def end_card(self, video_with_audio, out, title="SUBSCRIBE",
                 tagline="for more literary deep dives", seconds=5.0):
        self.log("[end card] building subscribe card from last frame")
        frame = os.path.join(self.work, "last_frame.jpg")
        ff.run([ff.FFMPEG, "-y", "-sseof", "-1", "-i", video_with_audio,
                "-update", "1", "-q:v", "2", frame])
        bold, reg = self._font()
        title_txt = title.replace("'", "\\'").replace(":", "\\:")
        tag_txt = tagline.replace("'", "\\'").replace(":", "\\:")
        vf = (
            f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
            f"boxblur=8:1,eq=brightness=-0.35:saturation=0.0,"
            f"drawtext=fontfile='{_q(bold)}':text='{title_txt}':fontcolor=white:fontsize=90:"
            f"x=(w-text_w)/2:y=(h-text_h)/2-40,"
            f"drawtext=fontfile='{_q(reg)}':text='{tag_txt}':fontcolor=white@0.85:fontsize=36:"
            f"x=(w-text_w)/2:y=(h-text_h)/2+70,format=yuv420p"
        )
        ff.run([
            ff.FFMPEG, "-y", "-loop", "1", "-i", frame, "-f", "lavfi",
            "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-t", f"{seconds}", "-vf", vf, "-r", str(FPS),
            "-video_track_timescale", "15360", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
            "-shortest", out,
        ])
        return out

    def concat(self, main, card, out):
        self.log("[concat] joining main video + end card")
        lst = os.path.join(self.work, "concat.txt")
        with open(lst, "w", encoding="utf-8") as f:
            f.write(f"file '{_q(main)}'\n")
            f.write(f"file '{_q(card)}'\n")
        raw = os.path.join(self.work, "concat_raw.mp4")
        ff.run([ff.FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", raw])
        ff.run([ff.FFMPEG, "-y", "-fflags", "+genpts", "-i", raw, "-c", "copy",
                "-movflags", "+faststart", out])
        return out

    def verify(self, path, expected):
        self.log("[verify] decoding whole file")
        bad = []
        ff.run([ff.FFMPEG, "-v", "warning", "-i", path, "-map", "0:v:0", "-f", "null", "-"],
               log=lambda l: bad.append(l) if "non monotonic" in l.lower() or "error" in l.lower() else None)
        d = ff.probe_duration(path)
        if abs(d - expected) > 1.0:
            raise RuntimeError(f"final duration {d:.2f}s but expected {expected:.2f}s")
        if bad:
            self.log("verify warnings: " + "; ".join(bad[:5]))
        return d

    # ---------------------------------------------------------------- driver
    def render(self, segs, image_for, audio_path, out_path, end_card_seconds=5.0,
               tagline="for more literary deep dives"):
        audio_dur = ff.probe_duration(audio_path)
        self.progress(0.02, "Preparing")
        clips = self.build_clips(segs, image_for)
        merged = self.tree_merge(clips)
        self.progress(0.87, "Adding narration")
        with_audio = self.mux(merged, audio_path, os.path.join(self.work, "with_audio.mp4"))
        self.progress(0.90, "Building end card")
        card = self.end_card(with_audio, os.path.join(self.work, "end_card.mp4"),
                             tagline=tagline, seconds=end_card_seconds)
        self.progress(0.93, "Finalizing")
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        tmp_out = os.path.join(self.work, "final_tmp.mp4")
        self.concat(with_audio, card, tmp_out)
        self.progress(0.96, "Verifying")
        self.verify(tmp_out, audio_dur + end_card_seconds)
        shutil.move(tmp_out, out_path)
        self.progress(1.0, "Done")
        return out_path
