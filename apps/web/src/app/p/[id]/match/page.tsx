"use client";

import { useState, useEffect, useMemo, useRef, use, useCallback } from "react";
import type { Project, Asset } from "@nva/core";
import { getProject, saveProject, getAssetUrl } from "@/lib/projectStorage";
import {
  matchByNumber,
  matchByAiVision,
  computeCoverageReport,
  type CoverageReport,
} from "@/lib/matcher";
import { useProviderStore } from "@/lib/providerStore";
import { createProvider, estimateTokens, type ProviderConfig } from "@nva/ai";
import { Icon } from "@/components/Icon";
import { PageHeader, PageShell } from "@/components/PageHeader";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Modal,
  SectionHeading,
  Select,
  cx,
} from "@/components/ui";

export default function MatchPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [project, setProject] = useState<Project | null>(null);
  const [assetUrls, setAssetUrls] = useState<Map<string, string>>(new Map());
  const [selectedBeatIndex, setSelectedBeatIndex] = useState(0);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);

  const [aiMatching, setAiMatching] = useState(false);
  const [aiProgressText, setAiProgressText] = useState("");
  const [showCostModal, setShowCostModal] = useState(false);
  const [estimatedTokens, setEstimatedTokens] = useState(0);
  const [rematchAll, setRematchAll] = useState(false);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const providers = useProviderStore((s) => s.providers);
  const keyStore = useProviderStore((s) => s.keyStore);
  const visionProviders = providers.filter((p) => p.role === "vision" || p.role === "both");

  const loadProjectData = useCallback(async () => {
    const proj = await getProject(params.id);
    if (!proj) return;
    setProject(proj);
    setCoverage(computeCoverageReport(proj));

    const urls = new Map<string, string>();
    for (const asset of proj.assets) {
      const url = await getAssetUrl(proj.id, asset.fileRef);
      if (url) urls.set(asset.id, url);
    }
    setAssetUrls(urls);
  }, [params.id]);

  useEffect(() => {
    void loadProjectData();
  }, [loadProjectData]);

  const selectedBeat = project?.beats[selectedBeatIndex];
  // Memoised: the keyboard effect depends on this, and a fresh array each
  // render would re-bind the listener on every state change.
  const candidateAssets: Asset[] = useMemo(
    () =>
      project
        ? project.assets.filter((a) => !a.spare && (a.kind === "image" || a.kind === "clip"))
        : [],
    [project],
  );

  // AI matching only touches unmatched beats and unused candidates by default,
  // so it never overwrites manual work and never pays to re-send used images.
  const usedAssetIds = useMemo(
    () => new Set((project?.beats ?? []).map((b) => b.assetId).filter(Boolean)),
    [project],
  );
  const aiTargetBeats = rematchAll
    ? (project?.beats ?? [])
    : (project?.beats ?? []).filter((b) => !b.assetId);
  const aiCandidates = rematchAll
    ? candidateAssets
    : candidateAssets.filter((a) => !usedAssetIds.has(a.id));

  const persist = useCallback(async (updated: Project) => {
    await saveProject(updated);
    setProject(updated);
    setCoverage(computeCoverageReport(updated));
  }, []);

  const assignAssetToBeat = useCallback(
    async (beatN: number, assetId: string | undefined) => {
      if (!project) return;
      const updatedBeats = project.beats.map((b) =>
        // A manual assignment is certain; clearing drops the confidence with it.
        b.n === beatN ? { ...b, assetId, confidence: assetId ? 1 : undefined } : b,
      );
      await persist({ ...project, beats: updatedBeats });
    },
    [project, persist],
  );

  const toggleAudioPreview = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      void audioRef.current.play();
      setIsPlayingAudio(true);
    }
  }, [isPlayingAudio]);

  // Keyboard review loop: j/k to walk beats, 1-9 to assign, space to audition.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!project || project.beats.length === 0) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedBeatIndex((prev) => Math.min(project.beats.length - 1, prev + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedBeatIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === " ") {
        e.preventDefault();
        toggleAudioPreview();
      } else if (/^[1-9]$/.test(e.key)) {
        const num = parseInt(e.key, 10);
        const targetAsset = candidateAssets[num - 1];
        const beat = project.beats[selectedBeatIndex];
        if (targetAsset && beat) {
          e.preventDefault();
          void assignAssetToBeat(beat.n, targetAsset.id);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [project, selectedBeatIndex, candidateAssets, assignAssetToBeat, toggleAudioPreview]);

  async function handleMatchByNumber() {
    if (!project) return;
    setError(null);
    const { beats: updatedBeats, matchedCount } = matchByNumber(project.beats, project.assets);
    await persist({ ...project, beats: updatedBeats });
    setNotice(
      matchedCount === 0
        ? "No filenames started with a beat number, so nothing was assigned. Names like 01_scene.png map to beat 1."
        : `Matched ${matchedCount} of ${project.beats.length} beats by filename number.`,
    );
  }

  function handlePrepareAiMatch() {
    if (!project) return;
    if (visionProviders.length === 0) {
      setError("No vision AI provider is configured. Add one in Settings first.");
      return;
    }
    setError(null);
    // Estimate against the real prompt payload, not its character count.
    const promptText = aiTargetBeats.map((b) => `${b.text} ${b.prompt ?? ""}`).join(" ");
    setEstimatedTokens(estimateTokens(promptText, aiCandidates.length));
    setShowCostModal(true);
  }

  async function handleConfirmAiMatch() {
    setShowCostModal(false);
    if (!project || visionProviders.length === 0) return;

    const providerMeta = visionProviders[0]!;
    const apiKey = keyStore.get(providerMeta.id);
    const cfg: ProviderConfig = {
      id: providerMeta.id,
      kind: providerMeta.kind,
      baseUrl: providerMeta.baseUrl,
      model: providerMeta.model,
      apiKey: apiKey ?? "",
    };

    const provider = createProvider(cfg);
    setAiMatching(true);
    setError(null);

    try {
      const { beats: updatedBeats, notes } = await matchByAiVision(
        project,
        provider,
        (prog) => setAiProgressText(prog.statusText),
        { onlyUnmatched: !rematchAll },
      );

      await persist({ ...project, beats: updatedBeats });
      setNotice(notes ? `AI matching finished. ${notes}` : "AI matching finished.");
    } catch (err) {
      setError(`AI matching failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAiMatching(false);
      setAiProgressText("");
    }
  }

  async function toggleSpare(assetId: string) {
    if (!project) return;
    const updatedAssets = project.assets.map((a) =>
      a.id === assetId ? { ...a, spare: !a.spare } : a,
    );
    await persist({ ...project, assets: updatedAssets });
  }

  if (!project) return null;

  const audioUrl = project.audio.fileRef ? assetUrls.get(project.audio.fileRef) : undefined;

  return (
    <PageShell>
      <PageHeader
        step="Step 3"
        title="Match images to beats"
        description="Assign a visual to every beat — by filename number, with AI vision, or by hand."
        next={{ href: `/p/${project.id}/timing`, label: "Next: Timing" }}
        actions={
          <>
            <Button icon="grid" onClick={() => void handleMatchByNumber()}>
              Match by number
            </Button>
            <Button icon="sparkles" loading={aiMatching} onClick={handlePrepareAiMatch}>
              Match by AI vision
            </Button>
          </>
        }
      />

      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlayingAudio(false)}
          className="hidden"
        />
      ) : null}

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

      {notice ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-md border border-border bg-accent-subtle px-3 py-2 text-label text-fg"
        >
          <Icon name="info" size={14} className="mt-0.5 shrink-0 text-accent" />
          <span className="flex-1">{notice}</span>
          <IconButton label="Dismiss" icon="close" size="sm" onClick={() => setNotice(null)} />
        </div>
      ) : null}

      {aiMatching ? (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-label text-fg"
        >
          <span
            className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent"
            aria-hidden="true"
          />
          {aiProgressText || "Matching with vision AI…"}
        </div>
      ) : null}

      {/* Coverage */}
      {coverage && project.beats.length > 0 ? (
        <Card className="mb-4 flex flex-col gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge
                tone={coverage.isComplete ? "success" : "warning"}
                icon={coverage.isComplete ? "check" : "alert"}
              >
                {coverage.isComplete
                  ? "All beats matched"
                  : `${coverage.unmatchedBeats.length} pending`}
              </Badge>
              <span className="tabular font-mono text-label text-fg-muted">
                {coverage.matchedBeats}/{coverage.totalBeats} beats · {coverage.coveragePercent}%
              </span>
            </div>
            <span className="tabular font-mono text-label text-fg-muted">
              {coverage.unusedAssets.length} unused candidates
            </span>
          </div>

          <div
            role="progressbar"
            aria-valuenow={coverage.coveragePercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Beat match coverage"
            className="h-1.5 w-full overflow-hidden rounded-sm bg-bg"
          >
            <div
              style={{ width: `${coverage.coveragePercent}%` }}
              className={cx(
                "h-full transition-[width]",
                coverage.isComplete ? "bg-success" : "bg-accent",
              )}
            />
          </div>

          {coverage.duplicateAssetIds.size > 0 ? (
            <p className="flex items-start gap-1.5 text-label text-fg-muted">
              <Icon name="info" size={13} className="mt-0.5 shrink-0" />
              {coverage.duplicateAssetIds.size} candidate
              {coverage.duplicateAssetIds.size === 1 ? " is" : "s are"} used by more than one beat.
            </p>
          ) : null}
        </Card>
      ) : null}

      {project.beats.length === 0 ? (
        <EmptyState
          icon="script"
          title="No beats to match"
          description="Split your script into beats first — each beat is what a candidate image gets assigned to."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Beats */}
          <div className="flex flex-col gap-2 lg:col-span-7">
            <SectionHeading>
              Beats
              <span className="tabular ml-2 font-mono text-label font-normal text-fg-muted">
                {project.beats.length}
              </span>
            </SectionHeading>

            <ol className="flex flex-col gap-2">
              {project.beats.map((beat, idx) => {
                const isSelected = idx === selectedBeatIndex;
                const matchedAsset = project.assets.find((a) => a.id === beat.assetId);
                const assetUrl = matchedAsset ? assetUrls.get(matchedAsset.id) : null;

                return (
                  <li key={beat.n}>
                    <Card
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const assetId = e.dataTransfer.getData("text/plain");
                        if (assetId) void assignAssetToBeat(beat.n, assetId);
                      }}
                      className={cx(
                        "flex flex-col gap-2 p-2.5 transition-colors sm:flex-row sm:items-start",
                        isSelected && "border-accent",
                        !beat.assetId && !isSelected && "border-dashed",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedBeatIndex(idx)}
                        aria-current={isSelected ? "true" : undefined}
                        aria-label={`Select beat ${beat.n}`}
                        className="flex flex-1 cursor-pointer items-start gap-3 rounded-md text-left"
                      >
                        <div className="flex shrink-0 flex-col items-center gap-1.5">
                          <span
                            className={cx(
                              "tabular flex h-5 min-w-5 items-center justify-center rounded-sm px-1 font-mono text-overline font-semibold",
                              isSelected ? "bg-accent text-accent-fg" : "bg-bg text-fg-muted",
                            )}
                          >
                            {beat.n}
                          </span>
                          <div className="aspect-video w-20 overflow-hidden rounded-sm border border-border bg-bg">
                            {matchedAsset && assetUrl ? (
                              matchedAsset.kind === "image" ? (
                                // eslint-disable-next-line @next/next/no-img-element -- local blob: object URL; next/image cannot optimize it
                                <img
                                  src={assetUrl}
                                  alt={matchedAsset.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <video src={assetUrl} className="h-full w-full object-cover" />
                              )
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                                <Icon name="image" size={14} />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-body leading-snug text-fg">{beat.text}</p>
                          {beat.prompt ? (
                            <p className="mt-1 text-label text-fg-muted">{beat.prompt}</p>
                          ) : null}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span className="truncate text-label text-fg-subtle">
                              {matchedAsset ? matchedAsset.name : "Unmatched"}
                            </span>
                            {beat.confidence !== undefined && beat.confidence < 1 ? (
                              <Badge tone={beat.confidence >= 0.7 ? "neutral" : "warning"}>
                                {Math.round(beat.confidence * 100)}% confident
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        <label htmlFor={`assign-${beat.n}`} className="sr-only">
                          Candidate for beat {beat.n}
                        </label>
                        <Select
                          id={`assign-${beat.n}`}
                          value={beat.assetId ?? ""}
                          onChange={(e) =>
                            void assignAssetToBeat(beat.n, e.target.value || undefined)
                          }
                          className="h-control-sm w-auto max-w-[160px] text-label"
                        >
                          <option value="">Unassigned</option>
                          {candidateAssets.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.name}
                            </option>
                          ))}
                        </Select>
                        {beat.assetId ? (
                          <IconButton
                            label={`Clear the candidate assigned to beat ${beat.n}`}
                            icon="close"
                            size="sm"
                            onClick={() => void assignAssetToBeat(beat.n, undefined)}
                          />
                        ) : null}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Candidates */}
          <div className="flex flex-col gap-3 lg:col-span-5">
            {selectedBeat ? (
              <Card className="flex flex-col gap-1 border-accent p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="tabular font-mono text-overline uppercase text-fg-muted">
                    Selected · beat {selectedBeat.n}
                  </span>
                  {audioUrl ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={isPlayingAudio ? "pause" : "play"}
                      onClick={toggleAudioPreview}
                    >
                      {isPlayingAudio ? "Pause" : "Audition"}
                    </Button>
                  ) : null}
                </div>
                <p className="text-body leading-snug text-fg">{selectedBeat.text}</p>
                {selectedBeat.prompt ? (
                  <p className="text-label text-fg-muted">{selectedBeat.prompt}</p>
                ) : null}
              </Card>
            ) : null}

            <Card className="flex flex-col gap-3 p-3">
              <SectionHeading>
                Candidates
                <span className="tabular ml-2 font-mono text-label font-normal text-fg-muted">
                  {candidateAssets.length}
                </span>
              </SectionHeading>
              <p className="text-label text-fg-muted">
                Click or drag a candidate onto a beat. Keys 1–9 assign to the selected beat.
              </p>

              {candidateAssets.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-label text-fg-muted">
                  No candidates — import images or clips, or unmark some as spare.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {candidateAssets.map((asset, idx) => {
                    const url = assetUrls.get(asset.id);
                    const shortcut = idx < 9 ? idx + 1 : null;

                    return (
                      <li key={asset.id}>
                        <div
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", asset.id)}
                          className="flex flex-col overflow-hidden rounded-md border border-border bg-surface transition-colors hover:border-border-strong"
                        >
                          <button
                            type="button"
                            disabled={!selectedBeat}
                            onClick={() =>
                              selectedBeat && void assignAssetToBeat(selectedBeat.n, asset.id)
                            }
                            aria-label={
                              selectedBeat
                                ? `Assign ${asset.name} to beat ${selectedBeat.n}`
                                : `${asset.name} — select a beat first`
                            }
                            className="relative aspect-video w-full cursor-pointer overflow-hidden bg-bg disabled:cursor-not-allowed"
                          >
                            {url ? (
                              asset.kind === "image" ? (
                                // eslint-disable-next-line @next/next/no-img-element -- local blob: object URL; next/image cannot optimize it
                                <img
                                  src={url}
                                  alt={asset.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <video src={url} className="h-full w-full object-cover" />
                              )
                            ) : null}

                            {shortcut ? (
                              <span className="absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-fg px-1 font-mono text-[10px] font-semibold text-bg">
                                {shortcut}
                              </span>
                            ) : null}
                          </button>

                          <div className="flex items-center justify-between gap-1 p-1.5">
                            <span className="truncate text-label text-fg" title={asset.name}>
                              {asset.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => void toggleSpare(asset.id)}
                              className="shrink-0 cursor-pointer rounded-sm px-1 text-label text-fg-muted transition-colors hover:text-fg"
                            >
                              Spare
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 text-label text-fg-muted">
              <Shortcut keys={["J", "↓"]} action="Next beat" />
              <Shortcut keys={["K", "↑"]} action="Previous beat" />
              <Shortcut keys={["1–9"]} action="Assign candidate" />
              <Shortcut keys={["Space"]} action="Audition audio" />
            </Card>
          </div>
        </div>
      )}

      <Modal
        open={showCostModal}
        onClose={() => setShowCostModal(false)}
        title="Run AI vision matching"
        description={`Sends ${aiCandidates.length} thumbnail${
          aiCandidates.length === 1 ? "" : "s"
        } to ${visionProviders[0]?.model ?? "the configured model"}.`}
        footer={
          <>
            <Button onClick={() => setShowCostModal(false)}>Cancel</Button>
            <Button variant="primary" icon="sparkles" onClick={() => void handleConfirmAiMatch()}>
              Start matching
            </Button>
          </>
        }
      >
        <dl className="flex flex-col gap-1.5 rounded-md border border-border bg-bg p-3 text-label">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Beats to match</dt>
            <dd className="tabular font-mono text-fg">
              {aiTargetBeats.length} of {project.beats.length}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">Candidate images sent</dt>
            <dd className="tabular font-mono text-fg">
              {aiCandidates.length} of {candidateAssets.length}
            </dd>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 font-medium">
            <dt className="text-fg">Estimated tokens</dt>
            <dd className="tabular font-mono text-fg">~{estimatedTokens.toLocaleString()}</dd>
          </div>
        </dl>

        <label className="mt-3 flex cursor-pointer items-start gap-2 text-label text-fg">
          <input
            type="checkbox"
            checked={rematchAll}
            onChange={(e) => setRematchAll(e.target.checked)}
            className="mt-0.5 cursor-pointer accent-[var(--accent)]"
          />
          <span>
            Re-match every beat
            <span className="block text-fg-muted">
              Includes beats you already assigned, and re-sends candidates already in use. Costs
              more, and overwrites manual choices.
            </span>
          </span>
        </label>

        <p className="mt-3 text-label text-fg-muted">
          Token count is an estimate only — each provider bills images differently.
        </p>
      </Modal>
    </PageShell>
  );
}

function Shortcut({ keys, action }: { keys: string[]; action: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex items-center gap-0.5">
        {keys.map((k) => (
          <kbd
            key={k}
            className="rounded-sm border border-border bg-bg px-1 py-0.5 font-mono text-[10px] text-fg"
          >
            {k}
          </kbd>
        ))}
      </span>
      {action}
    </span>
  );
}
