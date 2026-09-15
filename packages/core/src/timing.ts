import type { Beat, WordTiming } from "./schema.js";

export interface TimedSegment {
  n: number;
  start: number;
  dur: number;
  found?: boolean;
}

const BRACKET_CUE_RE = /\[[^\]]{1,40}\]/g;

function normalise(text: string): string {
  return text
    .replace(BRACKET_CUE_RE, "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fill in each segment's duration: it runs until the next one starts. */
function fillDurations(segs: TimedSegment[], audioDurationSec: number): TimedSegment[] {
  for (let i = 0; i < segs.length; i++) {
    const current = segs[i];
    if (!current) continue;
    const next = segs[i + 1]?.start ?? audioDurationSec;
    current.dur = Math.max(0.05, round3(next - current.start));
  }
  return segs;
}

/**
 * Proportional (fallback, no AI): each beat starts where its excerpt's
 * first words appear in the normalised narration; offset/total-chars scaled
 * against audio duration. Ported from
 * docs/build-package/reference_code/book.py::compute_timing.
 */
export function computeProportionalTiming(
  beats: Beat[],
  narration: string,
  audioDurationSec: number,
  startAtBeat = 1,
): TimedSegment[] {
  const text = normalise(narration);
  const total = text.length || 1;
  const use = beats.filter((b) => b.n >= startAtBeat).sort((a, b) => a.n - b.n);

  const offsets: { beat: Beat; idx: number; found: boolean }[] = [];
  let last = 0;
  for (const beat of use) {
    const anchorFull = normalise(beat.text);
    const anchor = (anchorFull.split("...")[0] ?? anchorFull).trim();
    let idx = -1;
    let found = false;
    for (const length of [60, 40, 25, 15]) {
      const candidate = anchor.slice(0, length).trim();
      if (candidate.length < 8) continue;
      const at = text.indexOf(candidate, Math.max(0, last - 5));
      if (at !== -1) {
        idx = at;
        found = true;
        break;
      }
    }
    if (idx === -1) idx = last;
    offsets.push({ beat, idx, found });
    last = idx;
  }

  const firstOff = offsets[0]?.idx ?? 0;
  const span = total - firstOff > 0 ? total - firstOff : total;

  const segs: TimedSegment[] = offsets.map(({ beat, idx, found }, i) => {
    const t = i === 0 ? 0 : ((idx - firstOff) / span) * audioDurationSec;
    return { n: beat.n, start: Math.max(0, round3(t)), dur: 0, found };
  });

  return fillDurations(segs, audioDurationSec);
}

/**
 * Aligned (accurate): given word-level timings for the FULL narration, in
 * the same order as the beats' words, assign each beat's start time to the
 * start time of its first word. wordTimings is expected to already be
 * aligned to the script (the DP alignment against raw transcription happens
 * upstream, in the web app's timing page — see
 * docs/build-package/04_RENDER_PIPELINE_REFERENCE.md §Timing).
 */
export function computeAlignedTiming(
  beats: Beat[],
  wordTimings: WordTiming[],
  audioDurationSec: number,
  startAtBeat = 1,
): TimedSegment[] {
  const use = beats.filter((b) => b.n >= startAtBeat).sort((a, b) => a.n - b.n);
  let cursor = 0;
  const raw: { n: number; start: number | null }[] = [];

  for (const beat of use) {
    const wordCount = countWords(normalise(beat.text));
    const slice = wordTimings.slice(cursor, cursor + wordCount);
    cursor += wordCount;
    const firstWord = slice[0];
    raw.push({ n: beat.n, start: firstWord ? firstWord.start : null });
  }

  // interpolate any beat with no aligned words from its neighbours
  for (let i = 0; i < raw.length; i++) {
    const current = raw[i];
    if (!current || current.start !== null) continue;
    const previous = i > 0 ? raw[i - 1]?.start ?? 0 : 0;
    const nextFound = raw.slice(i + 1).find((r) => r.start !== null)?.start;
    current.start = (previous + (nextFound ?? audioDurationSec)) / 2;
  }

  const segs: TimedSegment[] = raw.map((r) => ({
    n: r.n,
    start: round3(r.start ?? 0),
    dur: 0,
    found: true,
  }));

  return fillDurations(segs, audioDurationSec);
}

/** Enforce min/max hold by merging (too-short) or flagging (too-long, split preferred upstream). */
export function enforceHoldLimits(
  segs: TimedSegment[],
  minHoldSec: number,
  maxHoldSec: number,
): { segs: TimedSegment[]; overMax: number[] } {
  const overMax = segs.filter((s) => s.dur > maxHoldSec).map((s) => s.n);
  const merged: TimedSegment[] = [];
  for (const s of segs) {
    const previous = merged[merged.length - 1];
    if (previous && previous.dur < minHoldSec) {
      previous.dur = round3(previous.dur + s.dur);
    } else {
      merged.push({ ...s });
    }
  }
  return { segs: merged, overMax };
}

/**
 * Change narration speed: durations/starts scale by 1/speed (speeding up
 * shortens the audio, so beats arrive sooner). Recomputes every beat.
 */
export function applySpeed(segs: TimedSegment[], speed: number): TimedSegment[] {
  if (speed <= 0) throw new Error("speed must be > 0");
  return segs.map((s) => ({
    ...s,
    start: round3(s.start / speed),
    dur: round3(s.dur / speed),
  }));
}

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
