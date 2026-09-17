"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import {
  exportEDL,
  exportSRT,
  computeProportionalTiming,
  enforceHoldLimits,
  applySpeed,
  type Project,
  type TimedSegment,
} from "@nva/core";
import {
  renderInWorker,
  isRenderSupported,
  isWorkerRenderSupported,
  type RenderProgress,
  type RenderResult,
} from "@nva/render-web";
import { getProject, getAssetBlob } from "@/lib/projectStorage";
import { computeCoverageReport } from "@/lib/matcher";
import { Icon } from "@/components/Icon";
import { PageHeader, PageShell } from "@/components/PageHeader";
import { Badge, Button, Card, EmptyState, Field, Select, SectionHeading, cx } from "@/components/ui";

type Preset = "720p" | "1080p" | "4k";

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: "1080p", label: "1080p — 1920×1080, the YouTube default" },
  { value: "720p", label: "720p — fastest, good for checking a cut" },
  { value: "4k", label: "4K — 3840×2160, slowest" },
];

function dimsFor(preset: Preset, vertical: boolean): { width: number; height: number } {
  const table: Record<Preset, [number, number]> = {
    "720p": [1280, 720],
    "1080p": [1920, 1080],
    "4k": [3840, 2160],
  };
  const [w, h] = table[preset];
  return vertical ? { width: h, height: w } : { width: w, height: h };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Saved timing if the Timing step ran; otherwise derive it so render still works. */
function resolveSegments(project: Project): TimedSegment[] {
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

export default function RenderPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [project, setProject] = useState<Project | null>(null);
  const [preset, setPreset] = useState<Preset>("1080p");
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [result, setResult] = useState<RenderResult | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      const proj = await getProject(params.id);
      if (proj) setProject(proj);
    }
    void load();
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [params.id]);

  async function handleRender() {
    if (!project) return;
    setRendering(true);
    setError(null);
    setResult(null);
    setProgress(null);

    try {
      const images = new Map<string, Blob>();
      for (const asset of project.assets) {
        if (asset.kind === "audio") continue;
        const blob = await getAssetBlob(project.id, asset.fileRef);
        if (blob) images.set(asset.id, blob);
      }

      // Decode the narration so it can be muxed into the output.
      let audio: AudioBuffer | undefined;
      if (project.audio.fileRef) {
        const blob = await getAssetBlob(project.id, project.audio.fileRef);
        if (blob) {
          const ctx = new AudioContext();
          audio = await ctx.decodeAudioData(await blob.arrayBuffer());
          await ctx.close();
        }
      }

      const { width, height } = dimsFor(preset, project.output.aspect === "9:16");
      const renderProject: Project = { ...project, output: { ...project.output, width, height } };

      const res = await renderInWorker(
        renderProject,
        images,
        resolveSegments(project),
        audio,
        setProgress,
        {
          // In Next.js, new URL("...", import.meta.url) gives Webpack a
          // Worker entry point to bundle.  If this doesn't resolve (e.g.
          // in tests), renderInWorker falls back to main-thread mode.
          workerUrl: isWorkerRenderSupported()
            ? new URL("@nva/render-web/src/renderWorker.js", import.meta.url)
            : undefined,
        },
      );

      setResult(res);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(res.blob);
      urlRef.current = url;
      setVideoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRendering(false);
    }
  }

  if (!project) return null;

  const coverage = computeCoverageReport(project);
  const slug = project.name.toLowerCase().replace(/\s+/g, "_");
  const segments = resolveSegments(project);
  const supported = isRenderSupported();

  // A beat with no visual has nothing to draw, so rendering would leave a gap.
  if (!coverage.isComplete) {
    return (
      <PageShell>
        <PageHeader step="Step 6" title="Render output video" />
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning" icon="alert">
              Render blocked
            </Badge>
            <span className="tabular font-mono text-label text-fg-muted">
              {coverage.matchedBeats}/{coverage.totalBeats} beats matched
            </span>
          </div>
          <p className="max-w-prose text-body text-fg">
            {coverage.totalBeats === 0
              ? "This project has no beats yet. Split your script into beats, then match a visual to each one."
              : `Every beat needs a visual before the timeline can be encoded. ${coverage.unmatchedBeats.length} beat${
                  coverage.unmatchedBeats.length === 1 ? " is" : "s are"
                } still unmatched.`}
          </p>
          <Link
            href={`/p/${project.id}/${coverage.totalBeats === 0 ? "script" : "match"}`}
            className="inline-flex h-control w-fit cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 text-label font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            <Icon name="arrowRight" size={14} />
            {coverage.totalBeats === 0 ? "Go to script" : "Finish matching"}
          </Link>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        step="Step 6"
        title="Render output video"
        description="Encodes to MP4 in this browser, with the narration muxed in. Nothing is uploaded."
      />

      {!supported ? (
        <Card className="mb-4 flex items-start gap-2 p-4">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-label text-fg">
            This browser cannot encode video — WebCodecs is unavailable. Use Chrome or Edge 94+.
            The timeline exports below still work.
          </p>
        </Card>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive bg-destructive-subtle px-3 py-2 text-label text-destructive"
        >
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card className="flex flex-col gap-3 p-4">
            <SectionHeading>Output</SectionHeading>

            <Field label="Resolution" htmlFor="preset">
              <Select
                id="preset"
                value={preset}
                onChange={(e) => setPreset(e.target.value as Preset)}
                disabled={rendering}
              >
                {PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>

            <dl className="flex flex-col gap-1 rounded-md border border-border bg-bg p-3 text-label">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Beats</dt>
                <dd className="tabular font-mono text-fg">{project.beats.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Duration</dt>
                <dd className="tabular font-mono text-fg">
                  {segments.length > 0
                    ? `${Math.max(...segments.map((s) => s.start + s.dur)).toFixed(1)}s`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Narration</dt>
                <dd className="tabular font-mono text-fg">
                  {project.audio.fileRef ? `${project.audio.durationSec.toFixed(1)}s` : "none"}
                </dd>
              </div>
            </dl>

            {!project.audio.fileRef ? (
              <p className="flex items-start gap-1.5 text-label text-warning">
                <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                No narration imported — the video will be silent.
              </p>
            ) : null}

            <Button
              variant="primary"
              size="lg"
              icon="film"
              loading={rendering}
              disabled={!supported || rendering}
              onClick={() => void handleRender()}
            >
              {rendering ? "Rendering…" : "Render video"}
            </Button>

            {progress ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-label text-fg-muted">
                  <span>{progress.statusText}</span>
                  <span className="tabular font-mono">
                    {progress.percent}%
                    {progress.etaSec > 0 ? ` · ${progress.etaSec}s left` : ""}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={progress.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Render progress"
                  className="h-1.5 w-full overflow-hidden rounded-sm bg-bg"
                >
                  <div
                    style={{ width: `${progress.percent}%` }}
                    className="h-full bg-accent transition-[width]"
                  />
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <SectionHeading>Timeline exports</SectionHeading>
            <p className="text-label text-fg-muted">
              For Premiere, Resolve, CapCut, or a subtitle editor. Uses the same timing as the
              render.
            </p>
            <div className="flex gap-2">
              <Button
                icon="download"
                className="flex-1"
                onClick={() =>
                  download(
                    new Blob([exportEDL(project.beats, segments)], { type: "text/plain" }),
                    `${slug}.edl`,
                  )
                }
              >
                EDL
              </Button>
              <Button
                icon="download"
                className="flex-1"
                onClick={() =>
                  download(
                    new Blob([exportSRT(project.beats, segments)], { type: "text/plain" }),
                    `${slug}.srt`,
                  )
                }
              >
                SRT
              </Button>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-7">
          <Card className="flex flex-col gap-3 p-4">
            <SectionHeading
              action={
                result ? (
                  <Badge tone={result.verified ? "success" : "warning"} icon={result.verified ? "check" : "alert"}>
                    {result.verified ? "Verified" : "Check output"}
                  </Badge>
                ) : undefined
              }
            >
              Preview
            </SectionHeading>

            {videoUrl ? (
              <>
                <video
                  src={videoUrl}
                  controls
                  className="w-full rounded-md border border-border bg-black"
                />
                <dl className="flex flex-col gap-1 rounded-md border border-border bg-bg p-3 text-label">
                  <div className="flex justify-between">
                    <dt className="text-fg-muted">Audio track</dt>
                    <dd className={cx("font-medium", result?.hasAudio ? "text-success" : "text-warning")}>
                      {result?.hasAudio ? "Present" : "Missing"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-fg-muted">Checks</dt>
                    <dd className="text-fg">{result?.verification}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-fg-muted">SHA-256</dt>
                    <dd className="truncate font-mono text-fg-muted">{result?.sha256}</dd>
                  </div>
                </dl>
                <Button
                  variant="primary"
                  icon="download"
                  onClick={() => result && download(result.blob, `${slug}.mp4`)}
                >
                  Download MP4
                </Button>
              </>
            ) : (
              <EmptyState
                icon="film"
                title="Nothing rendered yet"
                description="Choose a resolution and render. The finished file plays here before you download it."
              />
            )}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
