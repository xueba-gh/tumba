import { describe, it, expect } from "vitest";
import { parseMatchingResponse } from "../prompts.js";

describe("parseMatchingResponse", () => {
  it("reads the documented shape", () => {
    const r = parseMatchingResponse(
      JSON.stringify({ matches: { "1": 3, "2": 7 }, confidence: { "1": 0.9 }, notes: "ok" }),
    );
    expect(r.matches).toEqual({ "1": 3, "2": 7 });
    expect(r.confidence).toEqual({ "1": 0.9 });
    expect(r.notes).toBe("ok");
  });

  it("unwraps a markdown fenced block", () => {
    const r = parseMatchingResponse('```json\n{"matches": {"1": 2}}\n```');
    expect(r.matches).toEqual({ "1": 2 });
  });

  it("ignores prose before and after the JSON", () => {
    const r = parseMatchingResponse('Sure! Here you go:\n{"matches": {"1": 2}}\nHope that helps.');
    expect(r.matches).toEqual({ "1": 2 });
  });

  it("stops at the first balanced object rather than the last brace", () => {
    // A greedy first-brace-to-last-brace match would swallow the trailing
    // object and fail to parse.
    const r = parseMatchingResponse('{"matches": {"1": 2}}\n\n{"debug": {"tokens": 10}}');
    expect(r.matches).toEqual({ "1": 2 });
  });

  it("accepts the array form", () => {
    const r = parseMatchingResponse(
      JSON.stringify({ matches: [{ beat: 1, image: 4 }, { beat: 2, image: 5 }] }),
    );
    expect(r.matches).toEqual({ "1": 4, "2": 5 });
  });

  it("accepts a bare map with no wrapper key", () => {
    const r = parseMatchingResponse('{"1": 3, "2": 4}');
    expect(r.matches).toEqual({ "1": 3, "2": 4 });
  });

  it("accepts per-beat objects carrying their own confidence", () => {
    const r = parseMatchingResponse(
      JSON.stringify({ matches: { "1": { image: 6, confidence: 0.4 } } }),
    );
    expect(r.matches).toEqual({ "1": 6 });
    expect(r.confidence).toEqual({ "1": 0.4 });
  });

  it("accepts numeric strings and IMAGE-prefixed values", () => {
    const r = parseMatchingResponse(JSON.stringify({ matches: { "1": "3", "2": "IMAGE 4" } }));
    expect(r.matches).toEqual({ "1": 3, "2": 4 });
  });

  it("tolerates braces inside string values", () => {
    const r = parseMatchingResponse('{"matches": {"1": 2}, "notes": "used {braces} here"}');
    expect(r.matches).toEqual({ "1": 2 });
    expect(r.notes).toBe("used {braces} here");
  });

  // The regression behind "AI matching finished" with 0/33 assigned.
  it("throws instead of silently returning no matches when the key is missing", () => {
    expect(() =>
      parseMatchingResponse(JSON.stringify({ notes: "Matched story beats to key imagery..." })),
    ).toThrow(/no usable beat-to-image mapping/i);
  });

  it("throws when matches is present but empty", () => {
    expect(() => parseMatchingResponse('{"matches": {}, "notes": "done"}')).toThrow(
      /no usable beat-to-image mapping/i,
    );
  });

  it("includes the reply in the error so it can be diagnosed", () => {
    expect(() => parseMatchingResponse("I cannot see any images.")).toThrow(
      /I cannot see any images/,
    );
  });

  it("reports malformed JSON distinctly", () => {
    expect(() => parseMatchingResponse('{"matches": {"1": }}')).toThrow(/malformed JSON/i);
  });

  it("keeps the raw reply on success", () => {
    const raw = '{"matches": {"1": 2}}';
    expect(parseMatchingResponse(raw).raw).toBe(raw);
  });
});
