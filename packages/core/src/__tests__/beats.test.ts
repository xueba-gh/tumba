import { describe, it, expect } from "vitest";
import { splitIntoBeats, splitSentences, verifyWordCount } from "../beats.js";

describe("splitSentences", () => {
  it("does not split on an abbreviation like 'Mrs.'", () => {
    const script = "Mrs. Benn walked into the room. She looked tired.";
    const sentences = splitSentences(script);
    expect(sentences.length).toBe(2);
    expect(sentences[0]!.text).toContain("Mrs. Benn walked into the room.");
    expect(sentences[1]!.text).toContain("She looked tired.");
  });

  it("does not split when the next character is lowercase (e.g. 'St. james')", () => {
    const script = "It happened on St. james street near the church.";
    const sentences = splitSentences(script);
    expect(sentences.length).toBe(1);
  });

  it("splits normal sentences on . ! ?", () => {
    const script = "This is one. Is this two? Yes, three!";
    const sentences = splitSentences(script);
    expect(sentences.length).toBe(3);
  });

  it("keeps closing quotes attached to the sentence", () => {
    const script = '"Hello there." she said. Then she left.';
    const sentences = splitSentences(script);
    expect(sentences.length).toBe(2);
    expect(sentences[0]!.text).toBe('"Hello there." she said.');
  });
});

describe("splitIntoBeats", () => {
  const longScript = Array.from(
    { length: 12 },
    (_, i) => `This is sentence number ${i + 1} and it has a handful of words in it.`,
  ).join(" ");

  it("never splits a sentence and the total word count matches the script", () => {
    const beats = splitIntoBeats(longScript, { targetWords: 25, minWords: 20, maxWords: 35 });
    expect(beats.length).toBeGreaterThan(1);
    expect(verifyWordCount(longScript, beats)).toBe(true);
  });

  it("every beat's text appears verbatim in the original script", () => {
    const beats = splitIntoBeats(longScript, { targetWords: 25, minWords: 20, maxWords: 35 });
    for (const beat of beats) {
      expect(longScript).toContain(beat.text);
    }
  });

  it("handles the Mrs. Benn abbreviation case inside a full split", () => {
    const script =
      "Mrs. Benn opened the door slowly. The hallway beyond was dark and silent. " +
      "She stepped inside and called out softly, wondering if anyone was home.";
    const beats = splitIntoBeats(script, { targetWords: 15, minWords: 10, maxWords: 30 });
    expect(verifyWordCount(script, beats)).toBe(true);
    const joined = beats.map((b) => b.text).join(" ");
    expect(joined).toContain("Mrs. Benn opened the door slowly.");
  });

  it("assigns sequential beat numbers starting at 1", () => {
    const beats = splitIntoBeats(longScript, { targetWords: 25, minWords: 20, maxWords: 35 });
    expect(beats.map((b) => b.n)).toEqual(beats.map((_, i) => i + 1));
  });

  it("merges a stub trailing group into the previous beat at the spec defaults", () => {
    // Three 12-word sentences close a group at 36 words (>= the default
    // 32-word target); the 3-word tail that follows is then merged back in.
    const body = Array.from(
      { length: 3 },
      (_, i) => `Sentence number ${i + 1} runs on for a little while with several words.`,
    ).join(" ");
    const script = `${body} Short tail here.`;
    const beats = splitIntoBeats(script);
    expect(beats.length).toBe(1);
    expect(verifyWordCount(script, beats)).toBe(true);
  });

  it("keeps a short trailing beat when smaller beats are configured", () => {
    // The spec's 12-word tail rule assumes the default 25-40 word target. With
    // a 4-word target a 5-word tail is a legitimate beat, not a stub, and must
    // not be swallowed by the beat before it.
    const script = "First beat here now. Second beat right after that.";
    const beats = splitIntoBeats(script, { targetWords: 4, minWords: 2, maxWords: 6 });
    expect(beats.length).toBe(2);
    expect(beats[1]!.text).toBe("Second beat right after that.");
  });
});
