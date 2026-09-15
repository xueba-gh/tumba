import { describe, it, expect } from "vitest";
import { splitIntoBeats } from "../beats.js";
import {
  computeProportionalTiming,
  computeAlignedTiming,
  applySpeed,
  enforceHoldLimits,
} from "../timing.js";
import type { WordTiming } from "../schema.js";

describe("computeProportionalTiming", () => {
  const script =
    "The old house stood at the end of the lane. Nobody had lived there for years. " +
    "One autumn evening a stranger arrived at the gate.";
  const beats = splitIntoBeats(script, { targetWords: 12, minWords: 8, maxWords: 20 });

  it("first beat starts at 0 and last beat ends at audio duration", () => {
    const segs = computeProportionalTiming(beats, script, 30);
    expect(segs[0].start).toBe(0);
    const last = segs[segs.length - 1];
    expect(Math.abs(last.start + last.dur - 30)).toBeLessThan(0.01);
  });

  it("produces monotonically increasing start times", () => {
    const segs = computeProportionalTiming(beats, script, 30);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].start).toBeGreaterThanOrEqual(segs[i - 1].start);
    }
  });

  it("audio starts at beat N: dropping earlier beats rebases the first used beat to 0", () => {
    const segsAll = computeProportionalTiming(beats, script, 30, 1);
    const segsFromN = computeProportionalTiming(beats, script, 30, beats[1].n);
    expect(segsFromN[0].n).toBe(beats[1].n);
    expect(segsFromN[0].start).toBe(0);
    expect(segsFromN.length).toBe(segsAll.length - 1);
  });
});

describe("computeAlignedTiming", () => {
  it("assigns each beat's start to its first word's timing", () => {
    const script = "First beat here now. Second beat right after that.";
    const beats = splitIntoBeats(script, { targetWords: 4, minWords: 2, maxWords: 6 });
    // "First beat here now." (4 words) + "Second beat right after that." (5 words)
    const words = "First beat here now Second beat right after that".split(" ");
    const wordTimings: WordTiming[] = words.map((w, i) => ({
      word: w,
      start: i * 0.5,
      end: i * 0.5 + 0.4,
    }));
    const segs = computeAlignedTiming(beats, wordTimings, 5);
    expect(segs[0].start).toBe(0);
    expect(segs[1].start).toBeCloseTo(4 * 0.5, 5);
  });
});

describe("applySpeed", () => {
  it("scales starts and durations by 1/speed", () => {
    const segs = [
      { n: 1, start: 0, dur: 10 },
      { n: 2, start: 10, dur: 5 },
    ];
    const sped = applySpeed(segs, 1.25);
    expect(sped[0].dur).toBeCloseTo(8, 5);
    expect(sped[1].start).toBeCloseTo(8, 5);
    expect(sped[1].dur).toBeCloseTo(4, 5);
  });

  it("throws on non-positive speed", () => {
    expect(() => applySpeed([{ n: 1, start: 0, dur: 1 }], 0)).toThrow();
  });
});

describe("enforceHoldLimits", () => {
  it("merges a beat under minHold into the previous one and flags beats over maxHold", () => {
    const segs = [
      { n: 1, start: 0, dur: 10 },
      { n: 2, start: 10, dur: 1 },
      { n: 3, start: 11, dur: 20 },
    ];
    const { segs: merged, overMax } = enforceHoldLimits(segs, 2, 15);
    expect(merged.length).toBe(2);
    expect(merged[0].dur).toBeCloseTo(11, 5);
    expect(overMax).toEqual([3]);
  });
});
