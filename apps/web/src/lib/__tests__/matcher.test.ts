import { describe, it, expect } from "vitest";
import type { Asset, Beat, Project } from "@nva/core";
import type { AIProvider } from "@nva/ai";
import {
  extractNumberFromFilename,
  matchByNumber,
  computeCoverageReport,
  matchByAiVision,
} from "../matcher";

function asset(over: Partial<Asset> & Pick<Asset, "id" | "name">): Asset {
  return {
    kind: "image",
    fileRef: over.name,
    spare: false,
    tags: [],
    ...over,
  } as Asset;
}

function beat(n: number, over: Partial<Beat> = {}): Beat {
  return { n, text: `Beat ${n}`, type: "image", ...over };
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: "1",
    output: { aspect: "16:9", fps: 30, width: 1920, height: 1080 },
    audio: { fileRef: undefined, durationSec: 0 },
    script: { text: "", language: "en" },
    beats: [],
    assets: [],
    style: {},
    timing: { startsAtBeat: 1 },
    ai: {},
    changeLog: [],
    ...over,
  } as unknown as Project;
}

describe("extractNumberFromFilename", () => {
  it.each([
    ["01_hero.png", 1],
    ["02-scene.jpg", 2],
    ["03.webp", 3],
    ["12_dark.png", 12],
    ["beat-04-intro.png", 4],
    ["beat_05_outro.jpg", 5],
  ])("reads the leading beat number from %s", (name, expected) => {
    expect(extractNumberFromFilename(name)).toBe(expected);
  });

  it.each([
    ["hero.png"],
    ["scene-01.png"], // number is not leading
    ["00_zero.png"], // beat numbers are 1-based
  ])("returns null for %s", (name) => {
    expect(extractNumberFromFilename(name)).toBeNull();
  });
});

describe("matchByNumber", () => {
  it("assigns each beat the asset whose filename leads with its number", () => {
    const beats = [beat(1), beat(2)];
    const assets = [asset({ id: "a1", name: "01_first.png" }), asset({ id: "a2", name: "02_second.png" })];

    const { beats: out, matchedCount } = matchByNumber(beats, assets);

    expect(matchedCount).toBe(2);
    expect(out[0]!.assetId).toBe("a1");
    expect(out[1]!.assetId).toBe("a2");
    expect(out[0]!.confidence).toBe(1);
  });

  it("leaves a beat untouched when nothing carries its number", () => {
    const { beats: out, matchedCount } = matchByNumber(
      [beat(1), beat(2)],
      [asset({ id: "a1", name: "01_first.png" })],
    );

    expect(matchedCount).toBe(1);
    expect(out[1]!.assetId).toBeUndefined();
  });

  it("ignores assets marked spare", () => {
    const { matchedCount } = matchByNumber(
      [beat(1)],
      [asset({ id: "a1", name: "01_first.png", spare: true })],
    );

    expect(matchedCount).toBe(0);
  });

  it("ignores audio assets", () => {
    const { matchedCount } = matchByNumber(
      [beat(1)],
      [asset({ id: "a1", name: "01_narration.mp3", kind: "audio" })],
    );

    expect(matchedCount).toBe(0);
  });

  it("keeps the first asset when two share a number", () => {
    const { beats: out } = matchByNumber(
      [beat(1)],
      [asset({ id: "a1", name: "01_a.png" }), asset({ id: "a2", name: "01_b.png" })],
    );

    expect(out[0]!.assetId).toBe("a1");
  });
});

describe("computeCoverageReport", () => {
  it("reports full coverage when every beat has an asset", () => {
    const p = project({
      beats: [beat(1, { assetId: "a1" }), beat(2, { assetId: "a2" })],
      assets: [asset({ id: "a1", name: "a.png" }), asset({ id: "a2", name: "b.png" })],
    });

    const r = computeCoverageReport(p);

    expect(r.isComplete).toBe(true);
    expect(r.coveragePercent).toBe(100);
    expect(r.unmatchedBeats).toEqual([]);
    expect(r.unusedAssets).toEqual([]);
  });

  it("lists unmatched beats and unused candidates", () => {
    const p = project({
      beats: [beat(1, { assetId: "a1" }), beat(2)],
      assets: [asset({ id: "a1", name: "a.png" }), asset({ id: "a2", name: "b.png" })],
    });

    const r = computeCoverageReport(p);

    expect(r.isComplete).toBe(false);
    expect(r.coveragePercent).toBe(50);
    expect(r.unmatchedBeats).toEqual([2]);
    expect(r.unusedAssets.map((a) => a.id)).toEqual(["a2"]);
  });

  it("flags a candidate reused across beats", () => {
    const p = project({
      beats: [beat(1, { assetId: "a1" }), beat(2, { assetId: "a1" })],
      assets: [asset({ id: "a1", name: "a.png" })],
    });

    const r = computeCoverageReport(p);

    expect(r.duplicateAssetIds.get("a1")).toEqual([1, 2]);
  });

  it("does not count spare assets as unused candidates", () => {
    const p = project({
      beats: [beat(1, { assetId: "a1" })],
      assets: [asset({ id: "a1", name: "a.png" }), asset({ id: "a2", name: "b.png", spare: true })],
    });

    expect(computeCoverageReport(p).unusedAssets).toEqual([]);
  });

  it("reports zero coverage for a project with no beats", () => {
    const r = computeCoverageReport(project());

    expect(r.coveragePercent).toBe(0);
    expect(r.isComplete).toBe(false);
  });
});

describe("matchByAiVision scoping", () => {
  // These guards run before the provider is ever touched.
  const provider = {} as AIProvider;

  it("refuses to spend a request when every beat is already matched", async () => {
    const p = project({
      beats: [beat(1, { assetId: "a1" })],
      assets: [asset({ id: "a1", name: "a.png" })],
    });

    await expect(matchByAiVision(p, provider)).rejects.toThrow(/already has a candidate/i);
  });

  it("refuses when no unused candidate is left to offer", async () => {
    const p = project({
      beats: [beat(1, { assetId: "a1" }), beat(2)],
      assets: [asset({ id: "a1", name: "a.png" })],
    });

    await expect(matchByAiVision(p, provider)).rejects.toThrow(/No unused candidates/i);
  });

  it("still refuses an empty pool when re-matching everything", async () => {
    const p = project({ beats: [beat(1)], assets: [] });

    await expect(matchByAiVision(p, provider, undefined, { onlyUnmatched: false })).rejects.toThrow(
      /No candidate assets/i,
    );
  });
});
