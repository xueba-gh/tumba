import { describe, it, expect } from "vitest";
import { exportProjectToZip, importProjectFromZip, type Project } from "../index.js";

describe("ZIP export and import round trip", () => {
  const sampleProject: Project = {
    id: "proj-1",
    name: "Sample Project",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: "1",
    output: { aspect: "16:9", width: 1920, height: 1080, fps: 30, codec: "h264" },
    audio: {
      fileRef: "narration.mp3",
      durationSec: 15.5,
      speed: 1.0,
      trimStartSec: 0,
      trimEndSec: 0,
      loudnessTarget: -16,
    },
    script: { text: "Hello world sample script.", language: "en" },
    beats: [
      { n: 1, text: "Hello world sample script.", type: "image", assetId: "img-1" },
    ],
    assets: [
      {
        id: "img-1",
        kind: "image",
        name: "hero.png",
        fileRef: "hero.png",
        width: 1920,
        height: 1080,
        tags: ["hero"],
        spare: false,
      },
    ],
    style: {
      transition: "dissolve",
      transitionSec: 0.5,
      kenBurns: { zoomMin: 1.035, zoomMax: 1.04, alternate: true },
    },
    timing: {
      mode: "proportional",
      startsAtBeat: 1,
      minHoldSec: 2,
      maxHoldSec: 15,
    },
    ai: {},
    changeLog: [],
  };

  it("exports project to zip and imports it back with matching data and media", async () => {
    const encoder = new TextEncoder();
    const mediaFiles = new Map<string, Uint8Array>([
      ["hero.png", encoder.encode("fake png image data bytes")],
      ["narration.mp3", encoder.encode("fake audio mp3 data bytes")],
    ]);

    const zipBuffer = exportProjectToZip(sampleProject, mediaFiles);
    expect(zipBuffer.length).toBeGreaterThan(100);

    const imported = await importProjectFromZip(zipBuffer);
    expect(imported.project.id).toBe("proj-1");
    expect(imported.project.name).toBe("Sample Project");
    expect(imported.project.beats.length).toBe(1);
    expect(imported.mediaFiles.size).toBe(2);

    const heroData = imported.mediaFiles.get("hero.png");
    expect(heroData).toBeDefined();
    const textDecoder = new TextDecoder();
    expect(textDecoder.decode(heroData)).toBe("fake png image data bytes");
  });
});
