"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import type { Project, Transition, Aspect } from "@nva/core";
import { getProject, saveProject } from "@/lib/projectStorage";

export default function VisualStylePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [project, setProject] = useState<Project | null>(null);

  const [transition, setTransition] = useState<Transition>("dissolve");
  const [transitionSec, setTransitionSec] = useState<number>(0.5);
  const [zoomMin, setZoomMin] = useState<number>(1.035);
  const [zoomMax, setZoomMax] = useState<number>(1.04);
  const [endCardEnabled, setEndCardEnabled] = useState<boolean>(false);
  const [endCardTitle, setEndCardTitle] = useState<string>("SUBSCRIBE");
  const [endCardTagline, setEndCardTagline] = useState<string>("");
  const [endCardSec, setEndCardSec] = useState<number>(5);
  const [aspect, setAspect] = useState<Aspect>("16:9");

  useEffect(() => {
    loadProject();
  }, [params.id]);

  async function loadProject() {
    const proj = await getProject(params.id);
    if (!proj) return;
    setProject(proj);
    setTransition(proj.style.transition);
    setTransitionSec(proj.style.transitionSec);
    setZoomMin(proj.style.kenBurns.zoomMin);
    setZoomMax(proj.style.kenBurns.zoomMax);
    setEndCardEnabled(proj.style.endCard?.enabled ?? false);
    setEndCardTitle(proj.style.endCard?.title ?? "SUBSCRIBE");
    setEndCardTagline(proj.style.endCard?.tagline ?? "");
    setEndCardSec(proj.style.endCard?.seconds ?? 5);
    setAspect(proj.output.aspect);
  }

  async function handleSaveStyle(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;

    let width = 1920;
    let height = 1080;
    if (aspect === "9:16") {
      width = 1080;
      height = 1920;
    } else if (aspect === "1:1") {
      width = 1080;
      height = 1080;
    }

    const updated: Project = {
      ...project,
      output: { ...project.output, aspect, width, height },
      style: {
        ...project.style,
        transition,
        transitionSec,
        kenBurns: {
          zoomMin,
          zoomMax,
          alternate: true,
        },
        endCard: {
          enabled: endCardEnabled,
          title: endCardTitle,
          tagline: endCardTagline,
          seconds: endCardSec,
          mode: "lastframe",
        },
      },
    };

    await saveProject(updated);
    setProject(updated);
    alert("Visual style settings saved!");
  }

  if (!project) return null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Step 5: Visual Style & Treatment</h1>
          <p className="text-xs text-neutral-500">
            Configure transitions, Ken Burns motion intensity, aspect presets, and end card text.
          </p>
        </div>

        <Link
          href={`/p/${project.id}/render`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
        >
          Next: Render Output →
        </Link>
      </div>

      <form onSubmit={handleSaveStyle} className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Transitions & Motion (6 cols) */}
        <div className="flex flex-col gap-6 lg:col-span-6">
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold mb-4">Transitions & Aspect Ratio</h2>

            <div className="flex flex-col gap-4 text-xs">
              <label className="flex flex-col gap-1 font-medium">
                Aspect Ratio Preset
                <select
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value as Aspect)}
                  className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-xs dark:border-neutral-700"
                >
                  <option value="16:9">16:9 Landscape (1920×1080 - YouTube / Desktop)</option>
                  <option value="9:16">9:16 Vertical (1080×1920 - Shorts / TikTok / Reels)</option>
                  <option value="1:1">1:1 Square (1080×1080 - Instagram / Posts)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 font-medium">
                Transition Type
                <select
                  value={transition}
                  onChange={(e) => setTransition(e.target.value as Transition)}
                  className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-xs dark:border-neutral-700"
                >
                  <option value="dissolve">Cross dissolve (Default, 0.5s)</option>
                  <option value="cut">Direct cut (Hard cut)</option>
                  <option value="fadeblack">Fade through black</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 font-medium">
                Transition Duration (seconds): {transitionSec}s
                <input
                  type="range"
                  min="0.3"
                  max="1.0"
                  step="0.1"
                  value={transitionSec}
                  onChange={(e) => setTransitionSec(parseFloat(e.target.value))}
                  className="w-full cursor-pointer accent-neutral-900 dark:accent-white"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold mb-4">Ken Burns Motion Intensity</h2>

            <div className="flex flex-col gap-4 text-xs">
              <label className="flex flex-col gap-1 font-medium">
                Min Zoom: {zoomMin.toFixed(3)}
                <input
                  type="range"
                  min="1.01"
                  max="1.05"
                  step="0.005"
                  value={zoomMin}
                  onChange={(e) => setZoomMin(parseFloat(e.target.value))}
                  className="w-full cursor-pointer accent-neutral-900 dark:accent-white"
                />
              </label>

              <label className="flex flex-col gap-1 font-medium">
                Max Zoom: {zoomMax.toFixed(3)}
                <input
                  type="range"
                  min="1.02"
                  max="1.10"
                  step="0.005"
                  value={zoomMax}
                  onChange={(e) => setZoomMax(parseFloat(e.target.value))}
                  className="w-full cursor-pointer accent-neutral-900 dark:accent-white"
                />
              </label>
            </div>
          </section>
        </div>

        {/* Right Column: End Card Settings (6 cols) */}
        <div className="flex flex-col gap-6 lg:col-span-6">
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">End Card Settings</h2>
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={endCardEnabled}
                  onChange={(e) => setEndCardEnabled(e.target.checked)}
                  className="h-4 w-4 accent-neutral-900 dark:accent-white"
                />
                Enable End Card
              </label>
            </div>

            {endCardEnabled && (
              <div className="flex flex-col gap-4 text-xs">
                <label className="flex flex-col gap-1 font-medium">
                  End Card Title Text
                  <input
                    type="text"
                    value={endCardTitle}
                    onChange={(e) => setEndCardTitle(e.target.value)}
                    placeholder="e.g. SUBSCRIBE FOR MORE"
                    className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-xs dark:border-neutral-700"
                  />
                </label>

                <label className="flex flex-col gap-1 font-medium">
                  Tagline / Subtitle Text
                  <input
                    type="text"
                    value={endCardTagline}
                    onChange={(e) => setEndCardTagline(e.target.value)}
                    placeholder="e.g. New episodes every Tuesday"
                    className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-xs dark:border-neutral-700"
                  />
                </label>

                <label className="flex flex-col gap-1 font-medium">
                  End Card Duration (seconds)
                  <input
                    type="number"
                    min="2"
                    max="15"
                    value={endCardSec}
                    onChange={(e) => setEndCardSec(Number(e.target.value))}
                    className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-xs dark:border-neutral-700"
                  />
                </label>
              </div>
            )}
          </section>

          <button
            type="submit"
            className="w-full rounded-lg bg-neutral-900 py-3 text-xs font-semibold text-white shadow hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
          >
            💾 Save Visual Style Settings
          </button>
        </div>
      </form>
    </main>
  );
}
