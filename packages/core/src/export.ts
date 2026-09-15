import type { Beat } from "./schema.js";
import type { TimedSegment } from "./timing.js";

function formatSrtTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msRem = ms % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msRem, 3)}`;
}

function formatEdlTimecode(sec: number, fps = 30): string {
  const totalFrames = Math.round(sec * fps);
  const h = Math.floor(totalFrames / (3600 * fps));
  const m = Math.floor((totalFrames % (3600 * fps)) / (60 * fps));
  const s = Math.floor((totalFrames % (60 * fps)) / fps);
  const f = totalFrames % fps;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

/** Export a simple CMX3600-style EDL, one cut per beat. */
export function exportEDL(beats: Beat[], segs: TimedSegment[], fps = 30): string {
  const byN = new Map(segs.map((s) => [s.n, s]));
  const lines: string[] = ["TITLE: Narrated Video Assembler Export", "FCM: NON-DROP FRAME", ""];
  let i = 1;
  for (const beat of [...beats].sort((a, b) => a.n - b.n)) {
    const seg = byN.get(beat.n);
    if (!seg) continue;
    const srcIn = "00:00:00:00";
    const srcOut = formatEdlTimecode(seg.dur, fps);
    const recIn = formatEdlTimecode(seg.start, fps);
    const recOut = formatEdlTimecode(seg.start + seg.dur, fps);
    lines.push(`${String(i).padStart(3, "0")}  AX       V     C        ${srcIn} ${srcOut} ${recIn} ${recOut}`);
    lines.push(`* FROM CLIP NAME: beat_${beat.n}`);
    lines.push("");
    i++;
  }
  return lines.join("\n");
}

/** Export beat text as an SRT caption track using each beat's timing. */
export function exportSRT(beats: Beat[], segs: TimedSegment[]): string {
  const byN = new Map(segs.map((s) => [s.n, s]));
  const blocks: string[] = [];
  let i = 1;
  for (const beat of [...beats].sort((a, b) => a.n - b.n)) {
    const seg = byN.get(beat.n);
    if (!seg) continue;
    const start = formatSrtTime(seg.start);
    const end = formatSrtTime(seg.start + seg.dur);
    blocks.push(`${i}\n${start} --> ${end}\n${beat.text.replace(/\[[^\]]{1,40}\]/g, "").trim()}\n`);
    i++;
  }
  return blocks.join("\n");
}
