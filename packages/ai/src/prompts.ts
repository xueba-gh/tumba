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
    "at most one beat unless there is truly no other candidate. Reply with ONLY JSON: " +
    '{"matches": {"<beat>": <imageIndex>}, "confidence": {"<beat>": 0-1}, "notes": "..."}';

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
}

export function parseMatchingResponse(raw: string): MatchResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("provider did not return JSON for the matching prompt");
  const data = JSON.parse(match[0]) as Partial<MatchResult>;
  return { matches: data.matches ?? {}, confidence: data.confidence, notes: data.notes ?? "" };
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
