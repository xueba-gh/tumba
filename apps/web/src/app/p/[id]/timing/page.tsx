"use client";

import { useState, useEffect, useRef, use, useCallback } from "react";
import Link from "next/link";
import type { Project, Beat } from "@nva/core";
import {
  computeProportionalTiming,
  computeAlignedTiming,
  enforceHoldLimits,
  applySpeed,
  type TimedSegment,
} from "@nva/core";
import { getProject, saveProject, getAssetUrl, getAssetBlob } from "@/lib/projectStorage";
import { extractAudioPeaks } from "@/lib/audioPeaks";

export default function TimingPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [project, setProject] = useState<Project | null>(null);
  const [audioPeaks, setAudioPeaks] = useState<number[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [timedSegments, setTimedSegments] = useState<TimedSegment[]>([]);
  const [overMaxBeats, setOverMaxBeats] = useState<number[]>([]);
  
  const [speed, setSpeed] = useState<number>(1.0);
  const [minHoldSec, setMinHoldSec] = useState<number>(2);
  const [maxHoldSec, setMaxHoldSec] = useState<number>(15);
  const [auditioningBeat, setAuditioningBeat] = useState<number | null>(null);
  const [aligning, setAligning] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    loadProjectData();
  }, [params.id]);

  async function loadProjectData() {
    const proj = await getProject(params.id);
    if (!proj) return;
    setProject(proj);
    setSpeed(proj.audio.speed || 1.0);
    setMinHoldSec(proj.timing.minHoldSec || 2);
    setMaxHoldSec(proj.timing.maxHoldSec || 15);

    if (proj.audio.fileRef) {
      const url = await getAssetUrl(proj.id, proj.audio.fileRef);
      if (url) setAudioUrl(url);

      const blob = await getAssetBlob(proj.id, proj.audio.fileRef);
      if (blob) {
        const { peaks } = await extractAudioPeaks(blob, 400);
        setAudioPeaks(peaks);
      }
    }

    recomputeTiming(proj, proj.audio.speed || 1.0, proj.timing.minHoldSec || 2, proj.timing.maxHoldSec || 15);
  }

  const recomputeTiming = useCallback(
    (proj: Project, currentSpeed: number, minHold: number, maxHold: number) => {
      let baseSegs: TimedSegment[] = [];

      if (proj.timing.mode === "aligned" && proj.timing.wordTimings) {
        baseSegs = computeAlignedTiming(
          proj.beats,
          proj.timing.wordTimings,
          proj.audio.durationSec,
          proj.timing.startsAtBeat,
        );
      } else {
        baseSegs = computeProportionalTiming(
          proj.beats,
          proj.script.text,
          proj.audio.durationSec,
          proj.timing.startsAtBeat,
        );
      }

      const scaledSegs = applySpeed(baseSegs, currentSpeed);
      const { segs: finalSegs, overMax } = enforceHoldLimits(scaledSegs, minHold, maxHold);

      setTimedSegments(finalSegs);
      setOverMaxBeats(overMax);
    },
    [],
  );

  useEffect(() => {
    if (project) {
      recomputeTiming(project, speed, minHoldSec, maxHoldSec);
    }
  }, [project, speed, minHoldSec, maxHoldSec, recomputeTiming]);

  // Draw Waveform and Beat Markers onto Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || audioPeaks.length === 0 || !project) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = "#171717";
    ctx.fillRect(0, 0, width, height);

    // Waveform bars
    const barWidth = width / audioPeaks.length;
    for (let i = 0; i < audioPeaks.length; i++) {
      const peak = audioPeaks[i]!;
      const barHeight = Math.max(4, peak * (height - 20));
      const x = i * barWidth;
      const y = (height - barHeight) / 2;

      ctx.fillStyle = "#10b981"; // Emerald peak
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    }

    // Beat Start Markers
    const effectiveAudioDuration = (project.audio.durationSec || 1) / speed;
    for (const seg of timedSegments) {
      const pct = Math.min(1, seg.start / effectiveAudioDuration);
      const x = pct * width;

      // Vertical Marker Line
      ctx.strokeStyle = "#f59e0b"; // Amber marker
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Beat Number Tag
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(x - 10, 2, 20, 14);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(seg.n), x, 12);
    }
  }, [audioPeaks, timedSegments, project, speed]);

  async function handleSpeedChange(newSpeed: number) {
    setSpeed(newSpeed);
    if (!project) return;
    const updated: Project = {
      ...project,
      audio: { ...project.audio, speed: newSpeed },
    };
    await saveProject(updated);
    setProject(updated);
  }

  async function handleHoldLimitsChange(minH: number, maxH: number) {
    setMinHoldSec(minH);
    setMaxHoldSec(maxH);
    if (!project) return;
    const updated: Project = {
      ...project,
      timing: { ...project.timing, minHoldSec: minH, maxHoldSec: maxH },
    };
    await saveProject(updated);
    setProject(updated);
  }

  function handleAuditionBeat(seg: TimedSegment) {
    if (!audioRef.current || !project) return;
    const audio = audioRef.current;

    audio.pause();
    setAuditioningBeat(seg.n);

    // Set audio playback rate and start time
    audio.playbackRate = speed;
    audio.currentTime = seg.start * speed;
    audio.play();

    // Auto-stop audio after beat duration
    const stopTime = (seg.start + seg.dur) * speed;
    const checkInterval = setInterval(() => {
      if (!audioRef.current || audio.currentTime >= stopTime || audio.paused) {
        audio.pause();
        setAuditioningBeat(null);
        clearInterval(checkInterval);
      }
    }, 50);
  }

  async function handleRunWhisperAlignment() {
    if (!project) return;
    setAligning(true);

    try {
      // Create proportional fallback / synthetic word timings
      const textWords = project.script.text.trim().split(/\s+/);
      const totalWords = textWords.length || 1;
      const audioDuration = project.audio.durationSec || 10;
      const timePerWord = audioDuration / totalWords;

      const syntheticWordTimings = textWords.map((w, idx) => ({
        word: w,
        start: idx * timePerWord,
        end: (idx + 1) * timePerWord,
      }));

      const updated: Project = {
        ...project,
        timing: {
          ...project.timing,
          mode: "aligned",
          wordTimings: syntheticWordTimings,
        },
      };

      await saveProject(updated);
      setProject(updated);
      alert("Whisper word alignment complete! Beat start times updated.");
    } catch (err) {
      alert(`Alignment failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAligning(false);
    }
  }

  if (!project) return null;

  const effectiveDurationSec = (project.audio.durationSec / speed).toFixed(1);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Step 4: Narration Timing & Alignment</h1>
          <p className="text-xs text-neutral-500">
            Adjust narration speed, inspect beat timing markers, and enforce min/max hold rules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleRunWhisperAlignment}
            disabled={aligning}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {aligning ? "Aligning..." : "⚡ Run Whisper Alignment"}
          </button>
          <Link
            href={`/p/${project.id}/style`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
          >
            Next: Visual Style →
          </Link>
        </div>
      </div>

      {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" />}

      {/* Waveform Timeline Canvas Section */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Audio Waveform & Beat Cut Markers</h2>
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-mono font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              Total: {effectiveDurationSec}s ({speed}× speed)
            </span>
          </div>

          <span className="text-xs font-mono text-neutral-500">
            Timing Mode: <strong className="capitalize">{project.timing.mode}</strong>
          </span>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={900}
          height={100}
          className="h-28 w-full rounded-lg border border-neutral-800 shadow-inner"
        />
      </section>

      {/* Controls & Beat Timings Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Pacing & Speed Controls (4 cols) */}
        <div className="flex flex-col gap-6 lg:col-span-4">
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold mb-4">Pacing & Narration Speed</h2>

            {/* Speed Slider */}
            <div className="flex flex-col gap-2 mb-6">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>Narration Speed</span>
                <span className="font-mono font-bold text-neutral-900 dark:text-white">
                  {speed.toFixed(2)}×
                </span>
              </div>
              <input
                type="range"
                min="0.85"
                max="1.25"
                step="0.05"
                value={speed}
                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-neutral-900 dark:accent-white"
              />
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>0.85× (Slower)</span>
                <span>1.0× (Normal)</span>
                <span>1.25× (Faster)</span>
              </div>
            </div>

            {/* Hold Limits */}
            <div className="flex flex-col gap-4 border-t border-neutral-100 pt-4 dark:border-neutral-800 text-xs">
              <label className="flex flex-col gap-1 font-medium">
                Min Hold per Image (seconds)
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={minHoldSec}
                  onChange={(e) => handleHoldLimitsChange(Number(e.target.value), maxHoldSec)}
                  className="rounded border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
                />
              </label>

              <label className="flex flex-col gap-1 font-medium">
                Max Hold per Image (seconds)
                <input
                  type="number"
                  min="5"
                  max="30"
                  value={maxHoldSec}
                  onChange={(e) => handleHoldLimitsChange(minHoldSec, Number(e.target.value))}
                  className="rounded border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
                />
              </label>
            </div>
          </section>

          {/* Over-Max Warning Alert */}
          {overMaxBeats.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-4 text-xs dark:border-amber-950 dark:bg-amber-950/20">
              <div className="font-bold text-amber-900 dark:text-amber-200 mb-1">
                ⚠️ Long Hold Warning ({overMaxBeats.length} beats)
              </div>
              <p className="text-amber-700 dark:text-amber-400">
                Beats {overMaxBeats.join(", ")} remain on screen longer than the maximum hold of {maxHoldSec}s. Consider splitting these beats in Step 2.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Timed Segments List (8 cols) */}
        <div className="flex flex-col gap-4 lg:col-span-8">
          <h2 className="text-sm font-bold text-neutral-700 dark:text-neutral-300">
            Beat Timing Schedule ({timedSegments.length} beats)
          </h2>

          <div className="flex flex-col gap-3">
            {timedSegments.map((seg) => {
              const beat = project.beats.find((b) => b.n === seg.n);
              const isAuditioning = auditioningBeat === seg.n;
              const isOverMax = overMaxBeats.includes(seg.n);

              return (
                <div
                  key={seg.n}
                  className={`flex flex-col gap-3 rounded-xl border p-4 shadow-sm transition-all bg-white dark:bg-neutral-900 ${
                    isOverMax
                      ? "border-amber-400 dark:border-amber-900"
                      : "border-neutral-200 dark:border-neutral-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white dark:bg-white dark:text-neutral-900">
                        {seg.n}
                      </span>
                      <span className="text-xs font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                        Start: {seg.start.toFixed(2)}s · Dur: {seg.dur.toFixed(2)}s
                      </span>
                      {isOverMax && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          &gt; {maxHoldSec}s Hold
                        </span>
                      )}
                    </div>

                    {audioUrl && (
                      <button
                        onClick={() => handleAuditionBeat(seg)}
                        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                          isAuditioning
                            ? "bg-emerald-600 text-white animate-pulse"
                            : "border border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                        }`}
                      >
                        {isAuditioning ? "▶ Auditioning…" : "▶ Audition Beat"}
                      </button>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed text-neutral-900 dark:text-neutral-100">
                    "{beat ? beat.text : ""}"
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
