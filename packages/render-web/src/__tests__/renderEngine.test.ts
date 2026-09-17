import { describe, it, expect } from "vitest";
import { computeSha256, isRenderSupported, pickVideoCodec } from "../renderEngine.js";


describe("computeSha256", () => {
  it("computes known SHA-256 for empty input", async () => {
    const empty = new Uint8Array(0);
    const hash = await computeSha256(empty);
    // SHA-256 of empty string = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("computes known SHA-256 for 'hello'", async () => {
    const data = new TextEncoder().encode("hello");
    const hash = await computeSha256(data);
    // SHA-256 of "hello" = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("produces 64-character hex string", async () => {
    const data = new TextEncoder().encode("any content");
    const hash = await computeSha256(data);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles a Uint8Array view over a larger buffer", async () => {
    // Ensure slice() is called to avoid reading slack bytes.
    const big = new Uint8Array(100);
    big[0] = 104; // 'h'
    big[1] = 105; // 'i'
    const view = big.subarray(0, 2);
    const hash = await computeSha256(view);
    // SHA-256 of "hi" = 8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4
    expect(hash).toBe("8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4");
  });
});

describe("isRenderSupported", () => {
  it("returns false when VideoEncoder is undefined", () => {
    // In a Node/Vitest env, VideoEncoder won't exist.
    // The function checks typeof window !== "undefined" first, so it will
    // return false in Node anyway.
    const result = isRenderSupported();
    // In test env (node), this should be false.
    expect(typeof result).toBe("boolean");
    // We can't guarantee the value in all test envs, but in Node it's false:
    if (typeof globalThis.window === "undefined") {
      expect(result).toBe(false);
    }
  });
});

describe("frame timing correctness", () => {
  const fps = 30;

  it("microsecond timestamp formula matches expected values", () => {
    // Verify the formula: Math.round((frame * 1_000_000) / fps)
    // Frame 0: 0 µs
    expect(Math.round((0 * 1_000_000) / fps)).toBe(0);
    // Frame 1: 33333 µs
    expect(Math.round((1 * 1_000_000) / fps)).toBe(33333);
    // Frame 30: exactly 1 second
    expect(Math.round((30 * 1_000_000) / fps)).toBe(1000000);
    // Frame 900: exactly 30 seconds
    expect(Math.round((900 * 1_000_000) / fps)).toBe(30000000);
  });

  it("frame duration is consistent", () => {
    const duration = Math.round(1_000_000 / fps);
    expect(duration).toBe(33333);
    // 30 frames × 33333µs = 999990µs ≈ 1s (the rounding is handled by
    // the timestamp formula, not the duration).
  });

  it("keyframe interval targets every 2 seconds", () => {
    const keyframeInterval = fps * 2; // 60 frames
    // Frame 0 should be a keyframe
    expect(0 % keyframeInterval).toBe(0);
    // Frame 60 should be a keyframe
    expect(60 % keyframeInterval).toBe(0);
    // Frame 30 should NOT be a keyframe
    expect(30 % keyframeInterval).not.toBe(0);
  });
});

describe("pickVideoCodec", () => {

  it("picks level 1f for 720p and below", () => {
    expect(pickVideoCodec(1280, 720)).toBe("avc1.64001f");
    expect(pickVideoCodec(640, 480)).toBe("avc1.64001f");
  });

  it("picks level 29 for 1080p", () => {
    expect(pickVideoCodec(1920, 1080)).toBe("avc1.640029");
  });

  it("picks level 33 for 4K", () => {
    expect(pickVideoCodec(3840, 2160)).toBe("avc1.640033");
  });

  it("picks level 33 for anything above 1080p", () => {
    expect(pickVideoCodec(2560, 1440)).toBe("avc1.640033");
  });
});
