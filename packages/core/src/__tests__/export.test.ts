import { describe, it, expect } from "vitest";
import { splitIntoBeats } from "../beats.js";
import { computeProportionalTiming } from "../timing.js";
import { exportSRT, exportEDL } from "../export.js";

describe("exportSRT / exportEDL", () => {
  const script = "A quiet street at dawn. A single light in one window.";
  const beats = splitIntoBeats(script, { targetWords: 6, minWords: 3, maxWords: 10 });
  const segs = computeProportionalTiming(beats, script, 12);

  it("SRT has one numbered block per beat with valid timecodes", () => {
    const srt = exportSRT(beats, segs);
    expect(srt).toMatch(/^1\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
    expect(srt.split("\n\n").filter(Boolean).length).toBe(beats.length);
  });

  it("EDL has one event per beat", () => {
    const edl = exportEDL(beats, segs);
    const eventLines = edl.split("\n").filter((l) => /^\d{3}\s+AX/.test(l));
    expect(eventLines.length).toBe(beats.length);
  });
});
