import { describe, it, expect } from "vitest";
import { buildMatchingVisionRequest, parseMatchingResponse } from "../prompts.js";

describe("buildMatchingVisionRequest", () => {
  it("labels each image with its index and file name, and lists every beat", () => {
    const { text, images } = buildMatchingVisionRequest(
      [
        { index: 0, fileName: "a.jpg", b64: "AAA", mime: "image/jpeg" },
        { index: 1, fileName: "b.jpg", b64: "BBB", mime: "image/jpeg" },
      ],
      [
        { n: 1, excerpt: "the door opened", prompt: "a wooden door" },
        { n: 2, excerpt: "she walked in", prompt: "a woman entering a room" },
      ],
    );
    expect(images[0]!.label).toBe("IMAGE 0 (file: a.jpg)");
    expect(images[1]!.label).toBe("IMAGE 1 (file: b.jpg)");
    expect(text).toContain("BEAT 1");
    expect(text).toContain("the door opened");
    expect(text).toContain("BEAT 2");
  });
});

describe("parseMatchingResponse", () => {
  it("parses a well-formed JSON reply", () => {
    const raw = 'Sure, here it is:\n{"matches": {"1": 0, "2": 1}, "confidence": {"1": 0.9}, "notes": "ok"}';
    const result = parseMatchingResponse(raw);
    expect(result.matches["1"]).toBe(0);
    expect(result.matches["2"]).toBe(1);
    expect(result.notes).toBe("ok");
  });

  it("throws when the provider returns no JSON at all", () => {
    expect(() => parseMatchingResponse("no json here")).toThrow();
  });
});
