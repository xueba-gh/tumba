import type { Beat } from "./schema.js";

/**
 * Script -> beats. Sentence boundary = . ! ? followed by optional closing
 * quotes/brackets, UNLESS the preceding word is an abbreviation or the next
 * non-space character is lowercase (protects "Mrs. Benn"). Group sentences
 * greedily to a target word count, never splitting a sentence; merge a
 * trailing group under 12 words into the previous one.
 * See docs/build-package/04_RENDER_PIPELINE_REFERENCE.md §Beat splitting.
 */

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "st", "jr", "sr", "vs", "mme", "mlle",
  "messrs", "gen", "col", "capt", "lt", "rev",
]);

const BRACKET_CUE_RE = /\[[^\]]{1,40}\]/g;

export interface SplitOptions {
  targetWords?: number;
  minWords?: number;
  maxWords?: number;
  /** Optional: cap a beat's word count harder if maxHoldSec/wordsPerSec implies it. */
  maxHoldSec?: number;
  wordsPerSecEstimate?: number;
}

interface Sentence {
  text: string;
  /** Text with bracket cues stripped, used only for word counting/timing. */
  cleanText: string;
  words: number;
}

function stripCues(text: string): string {
  return text.replace(BRACKET_CUE_RE, " ").replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/** Split raw script text into sentences, abbreviation-aware. */
export function splitSentences(script: string): Sentence[] {
  const sentences: Sentence[] = [];
  const len = script.length;
  let start = 0;
  let i = 0;

  const isBoundaryChar = (c: string) => c === "." || c === "!" || c === "?";

  while (i < len) {
    const c = script[i];
    if (isBoundaryChar(c)) {
      // consume any run of ./!/? plus closing quotes/brackets
      let j = i + 1;
      while (j < len && (isBoundaryChar(script[j]) || /["'”’\)\]]/.test(script[j]))) {
        j++;
      }
      const precedingWordMatch = script.slice(start, i).match(/([A-Za-z]+)\s*$/);
      const precedingWord = precedingWordMatch?.[1]?.toLowerCase();
      const isAbbrev = !!precedingWord && ABBREVIATIONS.has(precedingWord);

      // find next non-space char after the boundary run
      let k = j;
      while (k < len && /\s/.test(script[k])) k++;
      const nextChar = script[k];
      const nextIsLowercase = !!nextChar && /[a-z]/.test(nextChar);

      const isRealBoundary = !isAbbrev && !nextIsLowercase;

      if (isRealBoundary || j >= len) {
        const raw = script.slice(start, j).trim();
        if (raw) {
          const clean = stripCues(raw);
          sentences.push({ text: raw, cleanText: clean, words: countWords(clean) });
        }
        start = j;
        i = j;
        continue;
      }
      i = j;
      continue;
    }
    i++;
  }
  const tail = script.slice(start).trim();
  if (tail) {
    const clean = stripCues(tail);
    sentences.push({ text: tail, cleanText: clean, words: countWords(clean) });
  }
  return sentences;
}

export function splitIntoBeats(script: string, opts: SplitOptions = {}): Beat[] {
  const targetWords = opts.targetWords ?? 32;
  const minWords = opts.minWords ?? 25;
  const maxWords = opts.maxWords ?? 40;
  const sentences = splitSentences(script);

  const groups: Sentence[][] = [];
  let current: Sentence[] = [];
  let currentWords = 0;

  for (const s of sentences) {
    if (current.length > 0 && currentWords + s.words > maxWords && currentWords >= minWords) {
      groups.push(current);
      current = [];
      currentWords = 0;
    }
    current.push(s);
    currentWords += s.words;
    if (currentWords >= targetWords) {
      groups.push(current);
      current = [];
      currentWords = 0;
    }
  }
  if (current.length > 0) groups.push(current);

  // merge a trailing group under 12 words into the previous one
  if (groups.length > 1) {
    const last = groups[groups.length - 1];
    const lastWords = last.reduce((a, s) => a + s.words, 0);
    if (lastWords < 12) {
      groups[groups.length - 2] = [...groups[groups.length - 2], ...last];
      groups.pop();
    }
  }

  const beats: Beat[] = groups.map((g, idx) => ({
    n: idx + 1,
    text: g.map((s) => s.text).join(" ").trim(),
    type: "image" as const,
  }));

  // verify: sum of words across beats (cues stripped) == words in the script (cues stripped)
  const scriptWords = countWords(stripCues(script));
  const beatWords = beats.reduce((a, b) => a + countWords(stripCues(b.text)), 0);
  if (beatWords !== scriptWords) {
    // Should not happen given the algorithm above, but surface it loudly
    // rather than silently producing a beat set that fails the word-count
    // verification badge in the UI.
    throw new Error(
      `beat split word-count mismatch: script has ${scriptWords} words, beats have ${beatWords}`,
    );
  }

  return beats;
}

export function verifyWordCount(script: string, beats: Beat[]): boolean {
  const scriptWords = countWords(stripCues(script));
  const beatWords = beats.reduce((a, b) => a + countWords(stripCues(b.text)), 0);
  return scriptWords === beatWords;
}
