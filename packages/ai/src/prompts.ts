/**
 * Matching and script-analysis prompt builders. Text is assembled exactly
 * per docs/build-package/05_AI_PROVIDER_SPEC.md so every adapter sends the
 * same instructions regardless of provider.
 */
import type { VisionImage } from "./types.js";

export interface MatchBeat {
  n: number;
  excerpt: string;
  prompt: string;
}

export interface MatchCandidate {
  index: number;
  fileName: string;
  b64: string;
  mime: string;
}

export const MATCHING_SYSTEM_PROMPT =
  "You match illustrations to the beats of a narrated video. Be exact and literal about what is depicted.";

export function buildMatchingVisionRequest(
  candidates: MatchCandidate[],
  beats: MatchBeat[],
): { text: string; images: VisionImage[] } {
  const instruction =
    "For EVERY beat choose the ONE image whose content best depicts that beat's prompt and excerpt. " +
    "Prefer the sharpest, most on-prompt variant when several show the same scene. Use each image for " +
    "at most one beat unless there is truly no other candidate. " +
    "Reply with ONLY a JSON object and no prose outside it. The \"matches\" object is REQUIRED and " +
    "must map every beat number to an image number — an empty or missing \"matches\" is a failed " +
    "response. Beat numbers are the BEAT values below; image numbers are the IMAGE values on each " +
    "image. Shape:\n" +
    '{"matches": {"1": 3, "2": 7}, "confidence": {"1": 0.9, "2": 0.6}, "notes": "short summary"}';

  const beatLines = beats
    .map((b) => `BEAT ${b.n}\nexcerpt: ${b.excerpt}\nprompt: ${b.prompt}`)
    .join("\n\n");

  const text = [instruction, "", "BEATS:", "", beatLines].join("\n");

  const images: VisionImage[] = candidates.map((c) => ({
    b64: c.b64,
    mime: c.mime,
    label: `IMAGE ${c.index} (file: ${c.fileName})`,
  }));

  return { text, images };
}

export interface MatchResult {
  matches: Record<string, number>;
  confidence?: Record<string, number>;
  notes: string;
  /** The provider's reply, kept so a bad parse can be shown to the user. */
  raw?: string;
}

/**
 * Pulls the first balanced JSON object out of a reply. A greedy
 * `/\{[\s\S]*\}/` spans from the first brace to the last, which breaks as
 * soon as a model emits prose containing braces, or two JSON blocks.
 */
function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const haystack = fenced?.[1] ?? raw;

  const start = haystack.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < haystack.length; i++) {
    const ch = haystack[i]!;

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return haystack.slice(start, i + 1);
    }
  }
  return null;
}

/** Models express an image choice as a number, a numeric string, or an object. */
function coerceIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim().replace(/^image\s*/i, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const k of ["image", "imageIndex", "index", "candidate", "n"]) {
      const n = coerceIndex(o[k]);
      if (n !== null) return n;
    }
  }
  return null;
}

function coerceBeat(value: unknown): number | null {
  const n = coerceIndex(value);
  return n !== null && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Normalises the several shapes models actually return:
 *   {"matches": {"1": 3}}                  - the documented shape
 *   {"matches": [{"beat": 1, "image": 3}]} - array form
 *   {"1": 3}                               - bare map, no wrapper
 *   {"matches": {"1": {"image": 3, "confidence": 0.8}}}
 */
function normaliseMatches(data: Record<string, unknown>): {
  matches: Record<string, number>;
  confidence: Record<string, number>;
} {
  const matches: Record<string, number> = {};
  const confidence: Record<string, number> = {};

  const source = (data.matches ?? data.assignments ?? data.result ?? data) as unknown;

  const record = (beatRaw: unknown, valueRaw: unknown) => {
    const beat = coerceBeat(beatRaw);
    const image = coerceIndex(valueRaw);
    if (beat === null || image === null) return;
    matches[String(beat)] = image;

    if (valueRaw && typeof valueRaw === "object") {
      const c = (valueRaw as Record<string, unknown>).confidence;
      if (typeof c === "number") confidence[String(beat)] = c;
    }
  };

  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;
      record(o.beat ?? o.n ?? o.beatNumber, o.image ?? o.imageIndex ?? o.index ?? o.candidate ?? o);
    }
  } else if (source && typeof source === "object") {
    for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
      // Skip the sibling metadata keys when falling back to the whole object.
      if (["notes", "confidence", "matches", "assignments", "result"].includes(k)) continue;
      record(k, v);
    }
  }

  // A separate confidence map, when the model supplied one.
  const conf = data.confidence;
  if (conf && typeof conf === "object" && !Array.isArray(conf)) {
    for (const [k, v] of Object.entries(conf as Record<string, unknown>)) {
      const beat = coerceBeat(k);
      if (beat !== null && typeof v === "number") confidence[String(beat)] = v;
    }
  }

  return { matches, confidence };
}

export function parseMatchingResponse(raw: string): MatchResult {
  const json = extractJsonObject(raw);
  if (!json) {
    throw new Error(
      `provider did not return JSON for the matching prompt. It replied: ${raw.slice(0, 300)}`,
    );
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `provider returned malformed JSON (${String(err)}). It replied: ${raw.slice(0, 300)}`,
    );
  }

  const { matches, confidence } = normaliseMatches(data);
  const notes = typeof data.notes === "string" ? data.notes : "";

  // Never report success on an empty mapping: that silently looks like
  // "matching finished" while assigning nothing.
  if (Object.keys(matches).length === 0) {
    throw new Error(
      `provider returned no usable beat-to-image mapping. It replied: ${raw.slice(0, 300)}`,
    );
  }

  return {
    matches,
    confidence: Object.keys(confidence).length > 0 ? confidence : undefined,
    notes,
    raw,
  };
}

export function buildSuggestBeatsPrompt(script: string, targetWords: number, minWords: number, maxWords: number): string {
  return (
    `Given this script and pacing rules (target ${targetWords} words per beat, min ${minWords}, max ${maxWords}), ` +
    "return beats as JSON: {\"beats\": [{\"n\": 1, \"text\": \"...copied verbatim...\"}]}. " +
    "Copy each beat's text VERBATIM from the script — never paraphrase narration.\n\nSCRIPT:\n" +
    script
  );
}

export function buildWriteImagePromptsPrompt(beats: MatchBeat[], styleGuide: string): string {
  const beatLines = beats.map((b) => `BEAT ${b.n}: ${b.excerpt}`).join("\n");
  return (
    `Visual style: ${styleGuide}\n\n` +
    "For each beat below, write ONE image prompt that starts with the style phrase, describes one clear " +
    'scene, and avoids text-in-image. Reply as JSON: {"prompts": {"<beat>": "..."}}\n\n' +
    beatLines
  );
}

export function buildFlagLongHoldsPrompt(
  beats: { n: number; durSec: number }[],
  maxHoldSec: number,
): string {
  const over = beats.filter((b) => b.durSec > maxHoldSec);
  const lines = over.map((b) => `BEAT ${b.n}: ${b.durSec.toFixed(1)}s (max ${maxHoldSec}s)`).join("\n");
  return (
    `These beats exceed the maximum hold of ${maxHoldSec}s. For each, suggest a split point at a sentence ` +
    'boundary. Reply as JSON: {"splits": {"<beat>": "suggested split text"}}\n\n' +
    lines
  );
}

export function buildTitleAndHookPrompt(script: string): string {
  return (
    "Given this script, propose 5 title options and a 2-sentence hook. Reply as JSON: " +
    '{"titles": ["...", ...], "hook": "..."}\n\nSCRIPT:\n' +
    script
  );
}
