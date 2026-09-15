"use client";

import { useState, useEffect, use } from "react";
import {
  splitIntoBeats,
  verifyWordCount,
  type Project,
  type Beat,
  type BeatType,
  type Motion,
} from "@nva/core";
import { getProject, saveProject } from "@/lib/projectStorage";
import { useProviderStore } from "@/lib/providerStore";
import { createProvider, type ProviderConfig } from "@nva/ai";
import { PromptExportModal } from "@/components/PromptExportModal";
import { Icon } from "@/components/Icon";
import { PageHeader, PageShell } from "@/components/PageHeader";
import {
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  Input,
  SectionHeading,
  Select,
  Textarea,
} from "@/components/ui";

const STYLES = [
  "Cinematic movie still, dramatic atmospheric lighting, 8k render",
  "Photorealistic, crisp focal depth, natural lighting, high detail",
  "Classic oil painting, rich textures, expressive brush strokes",
  "Anime concept art, vivid colors, detailed background",
  "Minimalist vector illustration, clean lines, muted tones",
  "Dark moody documentary style, historic atmospheric render",
];

const BEAT_TYPES: Array<{ value: BeatType; label: string }> = [
  { value: "image", label: "Image" },
  { value: "clip", label: "Video clip" },
  { value: "title", label: "Title card" },
  { value: "blank", label: "Blank" },
];

const MOTIONS: Array<{ value: Motion; label: string }> = [
  { value: "in", label: "Zoom in" },
  { value: "out", label: "Zoom out" },
  { value: "panLR", label: "Pan left to right" },
  { value: "panRL", label: "Pan right to left" },
  { value: "none", label: "Static" },
];

export default function ScriptPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [project, setProject] = useState<Project | null>(null);
  const [scriptText, setScriptText] = useState("");
  const [targetWords, setTargetWords] = useState(32);
  const [minWords, setMinWords] = useState(25);
  const [maxWords, setMaxWords] = useState(40);
  const [maxHoldSec, setMaxHoldSec] = useState(15);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]!);
  const [aiLoading, setAiLoading] = useState(false);
  const [showPromptExport, setShowPromptExport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providers = useProviderStore((s) => s.providers);
  const keyStore = useProviderStore((s) => s.keyStore);
  const textProviders = providers.filter((p) => p.role === "text" || p.role === "both");

  useEffect(() => {
    async function loadProject() {
      const proj = await getProject(params.id);
      if (!proj) return;
      setProject(proj);
      setScriptText(proj.script.text);
    }
    void loadProject();
  }, [params.id]);

  function countWords(t: string): number {
    const trimmed = t.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  async function handleRunSplit() {
    if (!project || !scriptText.trim()) return;
    setError(null);
    try {
      const newBeats = splitIntoBeats(scriptText, {
        targetWords,
        minWords,
        maxWords,
        maxHoldSec,
      });

      const updated: Project = {
        ...project,
        script: { ...project.script, text: scriptText },
        beats: newBeats,
      };

      await saveProject(updated);
      setProject(updated);
    } catch (err) {
      setError(`Split failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function updateBeat(n: number, changes: Partial<Beat>) {
    if (!project) return;
    const updatedBeats = project.beats.map((b) => (b.n === n ? { ...b, ...changes } : b));
    const updated: Project = { ...project, beats: updatedBeats };
    await saveProject(updated);
    setProject(updated);
  }

  async function mergeBeatWithNext(index: number) {
    if (!project || index >= project.beats.length - 1) return;
    const current = project.beats[index]!;
    const next = project.beats[index + 1]!;

    const mergedBeat: Beat = {
      ...current,
      text: `${current.text} ${next.text}`,
      prompt: current.prompt ? `${current.prompt}; ${next.prompt || ""}` : next.prompt,
    };

    const newBeats = project.beats
      .filter((_, i) => i !== index + 1)
      .map((b, i) => (i === index ? mergedBeat : b))
      .map((b, i) => ({ ...b, n: i + 1 }));

    const updated: Project = { ...project, beats: newBeats };
    await saveProject(updated);
    setProject(updated);
  }

  async function deleteBeat(index: number) {
    if (!project) return;
    const newBeats = project.beats
      .filter((_, i) => i !== index)
      .map((b, i) => ({ ...b, n: i + 1 }));
    const updated: Project = { ...project, beats: newBeats };
    await saveProject(updated);
    setProject(updated);
  }

  async function handleStartsAtBeatChange(n: number) {
    if (!project) return;
    const updated: Project = {
      ...project,
      timing: { ...project.timing, startsAtBeat: n },
    };
    await saveProject(updated);
    setProject(updated);
  }

  async function handleAiPromptRewrite(mode: "all" | "missing") {
    if (!project) return;
    if (textProviders.length === 0) {
      setError("No text AI provider is configured. Add one in Settings first.");
      return;
    }
    setError(null);

    const providerMeta = textProviders[0]!;
    const apiKey = keyStore.get(providerMeta.id);
    const cfg: ProviderConfig = {
      id: providerMeta.id,
      kind: providerMeta.kind,
      baseUrl: providerMeta.baseUrl,
      model: providerMeta.model,
      apiKey: apiKey ?? "",
    };

    const provider = createProvider(cfg);
    setAiLoading(true);

    try {
      const updatedBeats = [...project.beats];
      for (let i = 0; i < updatedBeats.length; i++) {
        const beat = updatedBeats[i]!;
        if (mode === "missing" && beat.prompt) continue;

        const promptReq =
          `Write a detailed, single-sentence image generation prompt in the visual style of "${selectedStyle}" ` +
          `for the following narration beat text:\n"${beat.text}"\nReturn ONLY the prompt string without commentary.`;

        const responseText = await provider.chat({
          messages: [{ role: "user", content: promptReq }],
        });
        const generatedPrompt = responseText.trim().replace(/^["']|["']$/g, "");
        updatedBeats[i] = { ...beat, prompt: generatedPrompt };
      }

      const updated: Project = { ...project, beats: updatedBeats };
      await saveProject(updated);
      setProject(updated);
    } catch (err) {
      setError(`AI prompt rewrite failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAiLoading(false);
    }
  }

  if (!project) return null;

  const totalScriptWords = countWords(scriptText);
  const totalBeatWords = project.beats.reduce((a, b) => a + countWords(b.text), 0);
  const isVerified = project.beats.length > 0 && verifyWordCount(scriptText, project.beats);
  const hasBeats = project.beats.length > 0;

  return (
    <PageShell>
      <PageHeader
        step="Step 2"
        title="Script to beats"
        description="Split the narration into beat cards, then write or generate an image prompt for each."
        next={{ href: `/p/${project.id}/match`, label: "Next: Match" }}
        actions={
          hasBeats ? (
            <Button icon="download" onClick={() => setShowPromptExport(true)}>
              Export prompts
            </Button>
          ) : null
        }
      />

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive bg-destructive-subtle px-3 py-2 text-label text-destructive"
        >
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <IconButton label="Dismiss error" icon="close" size="sm" onClick={() => setError(null)} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Script and split controls */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card className="flex flex-col gap-3 p-4">
            <SectionHeading
              action={
                <span className="tabular font-mono text-label text-fg-muted">
                  {totalScriptWords} words
                </span>
              }
            >
              Narration script
            </SectionHeading>

            <label htmlFor="script-text" className="sr-only">
              Narration script
            </label>
            <Textarea
              id="script-text"
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="Paste your full narration script here…"
              className="h-64 max-w-prose"
            />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Target words / beat" htmlFor="target-words">
                <Input
                  id="target-words"
                  type="number"
                  min={1}
                  value={targetWords}
                  onChange={(e) => setTargetWords(Number(e.target.value))}
                  className="tabular font-mono"
                />
              </Field>
              <Field label="Max hold (seconds)" htmlFor="max-hold">
                <Input
                  id="max-hold"
                  type="number"
                  min={1}
                  value={maxHoldSec}
                  onChange={(e) => setMaxHoldSec(Number(e.target.value))}
                  className="tabular font-mono"
                />
              </Field>
              <Field label="Min words" htmlFor="min-words">
                <Input
                  id="min-words"
                  type="number"
                  min={1}
                  value={minWords}
                  onChange={(e) => setMinWords(Number(e.target.value))}
                  className="tabular font-mono"
                />
              </Field>
              <Field label="Max words" htmlFor="max-words">
                <Input
                  id="max-words"
                  type="number"
                  min={1}
                  value={maxWords}
                  onChange={(e) => setMaxWords(Number(e.target.value))}
                  className="tabular font-mono"
                />
              </Field>
            </div>

            <Button
              variant="primary"
              size="lg"
              icon="layers"
              disabled={!scriptText.trim()}
              onClick={() => void handleRunSplit()}
              className="w-full"
            >
              Split script into beats
            </Button>
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <SectionHeading>Prompt assistant</SectionHeading>
            <p className="text-label text-fg-muted">
              Generate an image-generation prompt for each beat using your configured text provider.
            </p>

            <Field label="Visual style preset" htmlFor="style-preset">
              <Select
                id="style-preset"
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value)}
              >
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex flex-col gap-2">
              <Button
                icon="sparkles"
                loading={aiLoading}
                disabled={!hasBeats}
                onClick={() => void handleAiPromptRewrite("all")}
              >
                {aiLoading ? "Generating prompts…" : "Rewrite all prompts"}
              </Button>
              <Button
                variant="ghost"
                disabled={aiLoading || !hasBeats}
                onClick={() => void handleAiPromptRewrite("missing")}
              >
                Fill missing prompts only
              </Button>
            </div>

            {textProviders.length === 0 ? (
              <p className="flex items-start gap-1.5 text-label text-fg-muted">
                <Icon name="info" size={13} className="mt-0.5 shrink-0" />
                No text provider configured — add one in Settings to enable these actions.
              </p>
            ) : null}
          </Card>
        </div>

        {/* Beats */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            {hasBeats ? (
              <div className="flex items-center gap-2">
                <Badge tone={isVerified ? "success" : "warning"} icon={isVerified ? "check" : "alert"}>
                  {isVerified ? "Verified" : "Word mismatch"}
                </Badge>
                <span className="tabular font-mono text-label text-fg-muted">
                  {totalBeatWords} beat {isVerified ? "=" : "vs"} {totalScriptWords} script
                </span>
              </div>
            ) : (
              <span className="text-label text-fg-muted">No beats yet</span>
            )}

            {hasBeats ? (
              <div className="flex items-center gap-2">
                <label htmlFor="starts-at-beat" className="text-label font-medium text-fg">
                  Audio starts at
                </label>
                <Select
                  id="starts-at-beat"
                  value={project.timing.startsAtBeat}
                  onChange={(e) => void handleStartsAtBeatChange(Number(e.target.value))}
                  className="w-auto"
                >
                  {project.beats.map((b) => (
                    <option key={b.n} value={b.n}>
                      Beat {b.n}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </Card>

          {!hasBeats ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-label text-fg-muted">
              Paste your script on the left, then choose{" "}
              <span className="font-medium text-fg">Split script into beats</span> to generate beat
              cards.
            </div>
          ) : (
            <ol className="flex flex-col gap-3">
              {project.beats.map((beat, idx) => (
                <li key={beat.n}>
                  <Card className="flex flex-col gap-3 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-sm bg-bg px-1 font-mono text-overline font-semibold text-fg">
                          {beat.n}
                        </span>
                        <span className="tabular font-mono text-label text-fg-subtle">
                          {countWords(beat.text)} words
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <label htmlFor={`beat-type-${beat.n}`} className="sr-only">
                          Beat {beat.n} type
                        </label>
                        <Select
                          id={`beat-type-${beat.n}`}
                          value={beat.type}
                          onChange={(e) =>
                            void updateBeat(beat.n, { type: e.target.value as BeatType })
                          }
                          className="h-control-sm w-auto text-label"
                        >
                          {BEAT_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </Select>

                        <label htmlFor={`beat-motion-${beat.n}`} className="sr-only">
                          Beat {beat.n} motion
                        </label>
                        <Select
                          id={`beat-motion-${beat.n}`}
                          value={beat.motion || "in"}
                          onChange={(e) =>
                            void updateBeat(beat.n, { motion: e.target.value as Motion })
                          }
                          className="h-control-sm w-auto text-label"
                        >
                          {MOTIONS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </Select>

                        {idx < project.beats.length - 1 ? (
                          <IconButton
                            label={`Merge beat ${beat.n} with the next beat`}
                            icon="merge"
                            size="sm"
                            onClick={() => void mergeBeatWithNext(idx)}
                          />
                        ) : null}

                        <IconButton
                          label={`Delete beat ${beat.n}`}
                          icon="trash"
                          size="sm"
                          className="text-fg-subtle hover:bg-destructive-subtle hover:text-destructive"
                          onClick={() => void deleteBeat(idx)}
                        />
                      </div>
                    </div>

                    <Field label="Beat text" htmlFor={`beat-text-${beat.n}`}>
                      <Textarea
                        id={`beat-text-${beat.n}`}
                        value={beat.text}
                        onChange={(e) => void updateBeat(beat.n, { text: e.target.value })}
                        rows={2}
                      />
                    </Field>

                    <Field
                      label="Image prompt"
                      htmlFor={`beat-prompt-${beat.n}`}
                      hint={beat.prompt ? undefined : "Empty prompts fall back to the beat text."}
                    >
                      <Input
                        id={`beat-prompt-${beat.n}`}
                        value={beat.prompt || ""}
                        onChange={(e) => void updateBeat(beat.n, { prompt: e.target.value })}
                        placeholder="Describe the image for this beat…"
                      />
                    </Field>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {showPromptExport ? (
        <PromptExportModal beats={project.beats} onClose={() => setShowPromptExport(false)} />
      ) : null}
    </PageShell>
  );
}
