import {
  splitIntoBeats,
  computeProportionalTiming,
  enforceHoldLimits,
  applySpeed,
  type Project,
  type TimedSegment,
} from "@nva/core";
import { createProvider, type ProviderConfig } from "@nva/ai";
import { renderProjectInBrowser, isRenderSupported, type RenderResult } from "@nva/render-web";
import { getProject, saveProject, getAssetBlob } from "@/lib/projectStorage";
import { matchByNumber, matchByAiVision, computeCoverageReport } from "@/lib/matcher";

export type StepId = "beats" | "match" | "timing" | "render";
export type StepState = "pending" | "running" | "done" | "skipped" | "failed";

export interface StepStatus {
  id: StepId;
  label: string;
  state: StepState;
  detail?: string;
}

export interface PipelineOptions {
  /** Vision provider for beats that filename-matching could not resolve. */
  vision?: ProviderConfig;
  /** Re-split the script even when beats already exist. */
  resplit?: boolean;
  /** Skip encoding — useful to prepare a batch and render later. */
  skipRender?: boolean;
  width?: number;
  height?: number;
}

export interface PipelineResult {
  project: Project;
  steps: StepStatus[];
  render?: RenderResult;
  /** True when every step either completed or was legitimately skipped. */
  ok: boolean;
}

const LABELS: Record<StepId, string> = {
  beats: "Split script into beats",
  match: "Match images to beats",
  timing: "Compute narration timing",
  render: "Encode MP4",
};

function initialSteps(): StepStatus[] {
  return (["beats", "match", "timing", "render"] as StepId[]).map((id) => ({
    id,
    label: LABELS[id],
    state: "pending",
  }));
}

export function resolveSegments(project: Project): TimedSegment[] {
  const saved = project.beats
    .filter((b) => b.startSec !== undefined && b.durSec !== undefined)
    .map((b) => ({ n: b.n, start: b.startSec!, dur: b.durSec! }));
  if (saved.length > 0) return saved;

  const base = computeProportionalTiming(
    project.beats,
    project.script.text,
    project.audio.durationSec,
    project.timing.startsAtBeat,
  );
  const held = enforceHoldLimits(base, project.timing.minHoldSec, project.timing.maxHoldSec);
  return applySpeed(held.segs, project.audio.speed || 1);
}

/**
 * Runs the whole pipeline for one project without stepping through the UI:
 * beats -> match -> timing -> encode.
 *
 * Each stage is skipped when its work is already done, so a re-run is cheap and
 * never undoes manual edits. The first hard failure stops the run — a later
 * stage would only produce a broken video from bad input.
 */
export async function runPipeline(
  projectId: string,
  options: PipelineOptions = {},
  onStep?: (steps: StepStatus[]) => void,
  onRenderProgress?: (percent: number, text: string) => void,
): Promise<PipelineResult> {
  const steps = initialSteps();
  const emit = () => onStep?.(steps.map((s) => ({ ...s })));

  function set(id: StepId, state: StepState, detail?: string) {
    const step = steps.find((s) => s.id === id)!;
    step.state = state;
    step.detail = detail;
    emit();
  }

  let project = await getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found.`);
  emit();

  // ---- 1. Beats
  set("beats", "running");
  if (project.beats.length > 0 && !options.resplit) {
    set("beats", "skipped", `${project.beats.length} beats already exist`);
  } else if (!project.script.text.trim()) {
    set("beats", "failed", "No script text. Import a .txt or paste a script first.");
    return { project, steps, ok: false };
  } else {
    const beats = splitIntoBeats(project.script.text, {
      targetWords: 32,
      minWords: 25,
      maxWords: 40,
      maxHoldSec: project.timing.maxHoldSec,
    });
    project = { ...project, beats };
    await saveProject(project);
    set("beats", "done", `${beats.length} beats`);
  }

  // ---- 2. Match
  set("match", "running", "Matching by filename number");
  const byNumber = matchByNumber(project.beats, project.assets);
  if (byNumber.matchedCount > 0) {
    project = { ...project, beats: byNumber.beats };
    await saveProject(project);
  }

  let coverage = computeCoverageReport(project);
  if (!coverage.isComplete && options.vision) {
    try {
      set("match", "running", `AI vision for ${coverage.unmatchedBeats.length} remaining beats`);
      const provider = createProvider(options.vision);
      const ai = await matchByAiVision(
        project,
        provider,
        (p) => set("match", "running", p.statusText),
        { onlyUnmatched: true },
      );
      project = { ...project, beats: ai.beats };
      await saveProject(project);
      coverage = computeCoverageReport(project);
    } catch (err) {
      // Filename matches may still have covered everything; judge on coverage.
      set("match", "running", `AI matching failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (coverage.isComplete) {
    set("match", "done", `${coverage.matchedBeats}/${coverage.totalBeats} beats matched`);
  } else {
    set(
      "match",
      "failed",
      `${coverage.unmatchedBeats.length} beat(s) still without an image: ${coverage.unmatchedBeats
        .slice(0, 8)
        .join(", ")}${coverage.unmatchedBeats.length > 8 ? "…" : ""}`,
    );
    return { project, steps, ok: false };
  }

  // ---- 3. Timing
  set("timing", "running");
  if (!project.audio.fileRef || project.audio.durationSec <= 0) {
    set("timing", "failed", "No narration audio. Import a voice-over on the Import step.");
    return { project, steps, ok: false };
  }
  const segs = resolveSegments(project);
  const byN = new Map(segs.map((s) => [s.n, s]));
  project = {
    ...project,
    beats: project.beats.map((b) => {
      const s = byN.get(b.n);
      return s ? { ...b, startSec: s.start, durSec: s.dur } : b;
    }),
  };
  await saveProject(project);
  const timelineSec = Math.max(...segs.map((s) => s.start + s.dur));
  set("timing", "done", `${segs.length} beats over ${timelineSec.toFixed(1)}s`);

  // ---- 4. Render
  if (options.skipRender) {
    set("render", "skipped", "Rendering turned off for this run");
    return { project, steps, ok: true };
  }
  if (!isRenderSupported()) {
    set("render", "failed", "WebCodecs unavailable — use Chrome or Edge 94+.");
    return { project, steps, ok: false };
  }

  set("render", "running", "Preparing assets");
  const images = new Map<string, Blob>();
  for (const asset of project.assets) {
    if (asset.kind === "audio") continue;
    const blob = await getAssetBlob(project.id, asset.fileRef);
    if (blob) images.set(asset.id, blob);
  }

  let audio: AudioBuffer | undefined;
  const audioBlob = await getAssetBlob(project.id, project.audio.fileRef);
  if (audioBlob) {
    const ctx = new AudioContext();
    audio = await ctx.decodeAudioData(await audioBlob.arrayBuffer());
    await ctx.close();
  }

  const renderProject: Project = {
    ...project,
    output: {
      ...project.output,
      width: options.width ?? project.output.width,
      height: options.height ?? project.output.height,
    },
  };

  try {
    const render = await renderProjectInBrowser(
      renderProject,
      images,
      (p) => {
        onRenderProgress?.(p.percent, p.statusText);
        set("render", "running", p.statusText);
      },
      { segments: segs, audio },
    );

    set(
      "render",
      render.verified ? "done" : "failed",
      render.verified ? render.verification : `Output failed checks: ${render.verification}`,
    );
    return { project, steps, render, ok: render.verified };
  } catch (err) {
    set("render", "failed", err instanceof Error ? err.message : String(err));
    return { project, steps, ok: false };
  }
}
