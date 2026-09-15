import { z } from "zod";

/**
 * project.json — the single source of truth for "what the video is".
 * Both the browser renderer and the optional Python agent consume this
 * exact shape, so they always agree on cut points. See
 * docs/build-package/02_ARCHITECTURE.md for the authoritative spec.
 */

export const AspectSchema = z.enum(["16:9", "9:16", "1:1"]);
export type Aspect = z.infer<typeof AspectSchema>;

export const TransitionSchema = z.enum(["dissolve", "cut", "fadeblack"]);
export type Transition = z.infer<typeof TransitionSchema>;

export const BeatTypeSchema = z.enum(["image", "clip", "title", "blank"]);
export type BeatType = z.infer<typeof BeatTypeSchema>;

export const MotionSchema = z.enum(["in", "out", "panLR", "panRL", "none"]);
export type Motion = z.infer<typeof MotionSchema>;

export const WordTimingSchema = z.object({
  word: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
});
export type WordTiming = z.infer<typeof WordTimingSchema>;

export const BeatSchema = z.object({
  n: z.number().int().positive(),
  text: z.string(),
  prompt: z.string().optional(),
  type: BeatTypeSchema,
  assetId: z.string().optional(),
  startSec: z.number().nonnegative().optional(),
  durSec: z.number().nonnegative().optional(),
  motion: MotionSchema.optional(),
  transitionOverride: TransitionSchema.optional(),
  notes: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type Beat = z.infer<typeof BeatSchema>;

export const AssetKindSchema = z.enum(["image", "clip", "audio"]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetSchema = z.object({
  id: z.string(),
  kind: AssetKindSchema,
  name: z.string(),
  fileRef: z.string(),
  sha256: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSec: z.number().nonnegative().optional(),
  caption: z.string().optional(),
  tags: z.array(z.string()).default([]),
  spare: z.boolean().default(false),
});
export type Asset = z.infer<typeof AssetSchema>;

export const OutputSchema = z.object({
  aspect: AspectSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.literal(30).default(30),
  codec: z.literal("h264").default("h264"),
});
export type Output = z.infer<typeof OutputSchema>;

export const AudioSchema = z.object({
  fileRef: z.string(),
  durationSec: z.number().nonnegative(),
  speed: z.number().min(0.85).max(1.25).default(1.0),
  trimStartSec: z.number().nonnegative().default(0),
  trimEndSec: z.number().nonnegative().default(0),
  loudnessTarget: z.number().default(-16),
});
export type ProjectAudio = z.infer<typeof AudioSchema>;

export const KenBurnsSchema = z.object({
  zoomMin: z.number().default(1.035),
  zoomMax: z.number().default(1.04),
  alternate: z.boolean().default(true),
});

export const EndCardSchema = z.object({
  enabled: z.boolean().default(false),
  title: z.string().default("SUBSCRIBE"),
  tagline: z.string().default(""),
  seconds: z.number().positive().default(5),
  mode: z.enum(["lastframe", "solid", "image"]).default("lastframe"),
});

export const CaptionsSchema = z.object({
  enabled: z.boolean().default(false),
  style: z.string().default("default"),
});

export const MusicSchema = z.object({
  fileRef: z.string().optional(),
  gainDb: z.number().default(-18),
  duck: z.boolean().default(true),
});

export const WatermarkSchema = z.object({
  fileRef: z.string().optional(),
  corner: z.enum(["tl", "tr", "bl", "br"]).default("br"),
  opacity: z.number().min(0).max(1).default(0.8),
});

export const StyleSchema = z.object({
  transition: TransitionSchema.default("dissolve"),
  transitionSec: z.number().positive().default(0.5),
  kenBurns: KenBurnsSchema.default({}),
  titleCard: z
    .object({ enabled: z.boolean().default(false), text: z.string().default("") })
    .optional(),
  endCard: EndCardSchema.optional(),
  captions: CaptionsSchema.optional(),
  music: MusicSchema.optional(),
  watermark: WatermarkSchema.optional(),
});

export const TimingSchema = z.object({
  mode: z.enum(["aligned", "proportional"]).default("proportional"),
  startsAtBeat: z.number().int().positive().default(1),
  minHoldSec: z.number().positive().default(2),
  maxHoldSec: z.number().positive().default(15),
  wordTimings: z.array(WordTimingSchema).optional(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.literal("1"),
  output: OutputSchema,
  audio: AudioSchema,
  script: z.object({ text: z.string(), language: z.string().default("en") }),
  beats: z.array(BeatSchema),
  assets: z.array(AssetSchema),
  style: StyleSchema,
  timing: TimingSchema,
  ai: z.object({
    visionProviderId: z.string().optional(),
    textProviderId: z.string().optional(),
  }),
  changeLog: z.array(z.object({ at: z.string(), what: z.string() })).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;
