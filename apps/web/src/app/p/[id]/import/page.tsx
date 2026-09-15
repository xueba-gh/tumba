"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import type { Project, Asset, AssetKind } from "@nva/core";
import {
  getProject,
  saveProject,
  saveAssetFile,
  getAssetUrl,
  getAssetBlob,
} from "@/lib/projectStorage";
import { computeImageHash, findNearDuplicates, type NearDuplicateGroup } from "@/lib/imageHash";
import { extractAudioPeaks } from "@/lib/audioPeaks";
import { Icon, type IconName } from "@/components/Icon";
import { PageHeader, PageShell } from "@/components/PageHeader";
import { Badge, Button, Card, IconButton, SectionHeading, cx } from "@/components/ui";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "clip", label: "Clips" },
  { value: "audio", label: "Audio" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

const KIND_ICON: Record<AssetKind, IconName> = {
  image: "image",
  clip: "video",
  audio: "audio",
};

export default function ImportPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [project, setProject] = useState<Project | null>(null);
  const [assetUrls, setAssetUrls] = useState<Map<string, string>>(new Map());
  const [assetHashes, setAssetHashes] = useState<Map<string, string>>(new Map());
  const [variantsMap, setVariantsMap] = useState<Map<string, NearDuplicateGroup>>(new Map());
  const [audioPeaks, setAudioPeaks] = useState<number[]>([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [activeFilter, setActiveFilter] = useState<Filter>("all");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProjectData = useCallback(async () => {
    const proj = await getProject(params.id);
    if (!proj) return;
    setProject(proj);

    // Load URLs and compute image hashes
    const urls = new Map<string, string>();
    const hashes = new Map<string, string>();

    for (const asset of proj.assets) {
      const url = await getAssetUrl(proj.id, asset.fileRef);
      if (url) urls.set(asset.id, url);

      if (asset.kind === "image") {
        const blob = await getAssetBlob(proj.id, asset.fileRef);
        if (blob) {
          const hash = await computeImageHash(blob);
          hashes.set(asset.id, hash);
        }
      }
    }

    setAssetUrls(urls);
    setAssetHashes(hashes);

    const vars = findNearDuplicates(proj.assets, hashes);
    setVariantsMap(vars);

    // Load audio peaks if narration audio exists
    if (proj.audio.fileRef) {
      const audioBlob = await getAssetBlob(proj.id, proj.audio.fileRef);
      if (audioBlob) {
        const { peaks } = await extractAudioPeaks(audioBlob, 200);
        setAudioPeaks(peaks);
      }
    }
  }, [params.id]);

  useEffect(() => {
    void loadProjectData();
  }, [loadProjectData]);

  async function handleFilesUpload(files: FileList | File[]) {
    if (!project) return;
    setProcessing(true);

    const updatedAssets = [...project.assets];
    let updatedAudio = { ...project.audio };
    let scriptText = project.script.text;

    for (const file of Array.from(files)) {
      const name = file.name;
      const lower = name.toLowerCase();

      if (lower.endsWith(".txt") || lower.endsWith(".md")) {
        // Script text file
        scriptText = await file.text();
        continue;
      }

      let kind: AssetKind = "image";
      if (
        lower.endsWith(".mp3") ||
        lower.endsWith(".wav") ||
        lower.endsWith(".m4a") ||
        lower.endsWith(".aac") ||
        lower.endsWith(".ogg")
      ) {
        kind = "audio";
      } else if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov")) {
        // Video clip or audio mp4
        if (lower.includes("narration") || lower.includes("audio") || lower.includes("voice")) {
          kind = "audio";
        } else {
          kind = "clip";
        }
      }

      const fileRef = await saveAssetFile(project.id, name, file);
      const assetId = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      if (kind === "audio") {
        const { durationSec, peaks } = await extractAudioPeaks(file);
        updatedAudio = {
          ...updatedAudio,
          fileRef,
          durationSec,
        };
        setAudioPeaks(peaks);
      }

      // Read image dimensions if image
      let width: number | undefined;
      let height: number | undefined;
      if (kind === "image") {
        try {
          const img = new Image();
          const url = URL.createObjectURL(file);
          await new Promise((res) => {
            img.onload = () => {
              width = img.naturalWidth;
              height = img.naturalHeight;
              URL.revokeObjectURL(url);
              res(null);
            };
            img.onerror = () => res(null);
            img.src = url;
          });
        } catch {
          // Ignore error
        }
      }

      const newAsset: Asset = {
        id: assetId,
        kind,
        name,
        fileRef,
        width,
        height,
        spare: false,
        tags: [],
      };

      updatedAssets.push(newAsset);
    }

    const updatedProject: Project = {
      ...project,
      audio: updatedAudio,
      script: { ...project.script, text: scriptText },
      assets: updatedAssets,
    };

    await saveProject(updatedProject);
    await loadProjectData();
    setProcessing(false);
  }

  async function toggleSpare(assetId: string) {
    if (!project) return;
    const updatedAssets = project.assets.map((a) =>
      a.id === assetId ? { ...a, spare: !a.spare } : a,
    );
    const updated = { ...project, assets: updatedAssets };
    await saveProject(updated);
    setProject(updated);
  }

  async function deleteAsset(assetId: string) {
    if (!project) return;
    const updatedAssets = project.assets.filter((a) => a.id !== assetId);
    const updated = { ...project, assets: updatedAssets };
    await saveProject(updated);
    await loadProjectData();
  }

  const filteredAssets = project
    ? project.assets.filter((a) => (activeFilter === "all" ? true : a.kind === activeFilter))
    : [];

  if (!project) return null;

  const counts: Record<Filter, number> = {
    all: project.assets.length,
    image: project.assets.filter((a) => a.kind === "image").length,
    clip: project.assets.filter((a) => a.kind === "clip").length,
    audio: project.assets.filter((a) => a.kind === "audio").length,
  };

  return (
    <PageShell>
      <PageHeader
        step="Step 1"
        title="Import media & script"
        description="Add your voice-over, images, b-roll clips, and script. Files stay on this device."
        next={{ href: `/p/${project.id}/script`, label: "Next: Script" }}
      />

      {/* Dropzone — a real button, so it is reachable by keyboard. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files?.length) {
            void handleFilesUpload(e.dataTransfer.files);
          }
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => e.target.files && void handleFilesUpload(e.target.files)}
          multiple
          accept="audio/*,image/*,video/*,.txt,.md"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-busy={processing || undefined}
          className={cx(
            "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors",
            dragActive
              ? "border-accent bg-accent-subtle"
              : "border-border bg-surface hover:border-border-strong",
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg text-fg-muted">
            <Icon name="upload" size={20} />
          </span>
          <span className="text-body font-medium text-fg">Drop files here, or click to browse</span>
          <span className="max-w-md text-label text-fg-muted">
            Audio (.mp3, .wav, .m4a) · Images (.jpg, .png, .webp) · Clips (.mp4, .mov) · Script
            (.txt, .md)
          </span>
          {processing ? (
            <span role="status" className="mt-1 flex items-center gap-1.5 text-label text-accent">
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              Processing files and computing image hashes…
            </span>
          ) : null}
        </button>
      </div>

      {/* Voice-over */}
      {project.audio.fileRef ? (
        <Card className="mt-6 p-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Icon name="audio" size={16} className="text-fg-muted" />
              <h2 className="text-heading font-semibold text-fg">Voice-over</h2>
              <span className="tabular rounded-sm border border-border bg-bg px-1.5 py-0.5 font-mono text-overline text-fg-muted">
                {project.audio.durationSec.toFixed(1)}s
              </span>
            </div>

            {assetUrls.has(project.audio.fileRef) ? (
              <Button
                icon={isPlayingAudio ? "pause" : "play"}
                onClick={() => {
                  if (!audioRef.current) return;
                  if (isPlayingAudio) {
                    audioRef.current.pause();
                    setIsPlayingAudio(false);
                  } else {
                    void audioRef.current.play();
                    setIsPlayingAudio(true);
                  }
                }}
              >
                {isPlayingAudio ? "Pause" : "Play"}
              </Button>
            ) : null}
          </div>

          <audio
            ref={audioRef}
            src={assetUrls.get(project.audio.fileRef)}
            onEnded={() => setIsPlayingAudio(false)}
            className="hidden"
          />

          {/* Waveform — amplitude is the one place color carries data here. */}
          <div className="flex h-16 w-full items-center gap-px overflow-hidden rounded-md border border-border bg-bg px-2">
            {audioPeaks.length > 0 ? (
              audioPeaks.map((peak, idx) => (
                <div
                  key={idx}
                  style={{ height: `${Math.max(6, peak * 100)}%` }}
                  className="flex-1 rounded-sm bg-accent/70"
                />
              ))
            ) : (
              <div className="flex h-full w-full items-center justify-center text-label text-fg-muted">
                Generating waveform…
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {/* Assets */}
      <section className="mt-6">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeading>
            Imported assets
            <span className="tabular ml-2 font-mono text-label font-normal text-fg-muted">
              {project.assets.length}
            </span>
          </SectionHeading>

          <div
            role="radiogroup"
            aria-label="Filter assets by type"
            className="flex w-fit items-center gap-0.5 rounded-md border border-border bg-surface p-0.5"
          >
            {FILTERS.map((f) => {
              const active = activeFilter === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setActiveFilter(f.value)}
                  className={cx(
                    "cursor-pointer rounded-sm px-2.5 py-1 text-label font-medium transition-colors",
                    active ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg hover:text-fg",
                  )}
                >
                  {f.label}
                  <span className="tabular ml-1.5 font-mono opacity-70">{counts[f.value]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {filteredAssets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-label text-fg-muted">
            {project.assets.length === 0
              ? "Nothing imported yet — add files above to get started."
              : `No ${activeFilter} assets. Switch the filter, or import more files.`}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredAssets.map((asset) => {
              const url = assetUrls.get(asset.id);
              const variantInfo = variantsMap.get(asset.id);

              return (
                <li key={asset.id}>
                  <Card
                    className={cx(
                      "flex h-full flex-col overflow-hidden transition-colors hover:border-border-strong",
                      asset.spare && "opacity-70",
                    )}
                  >
                    <div className="relative aspect-video w-full overflow-hidden border-b border-border bg-bg">
                      {asset.kind === "image" && url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- local blob: object URL; next/image cannot optimize it
                        <img src={url} alt={asset.name} className="h-full w-full object-cover" />
                      ) : asset.kind === "clip" && url ? (
                        <video src={url} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                          <Icon name={KIND_ICON[asset.kind]} size={20} />
                        </div>
                      )}

                      {asset.spare ? (
                        <div className="absolute left-2 top-2">
                          <Badge tone="warning">Spare</Badge>
                        </div>
                      ) : null}

                      {variantInfo ? (
                        <div
                          className="absolute bottom-2 left-2 right-2"
                          title={`Near-duplicate variant — ${variantInfo.similarityPct}% visual match`}
                        >
                          <Badge tone="warning" icon="alert" className="w-full justify-center">
                            Variant · {variantInfo.similarityPct}%
                          </Badge>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-1 flex-col justify-between gap-2 p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-label font-medium text-fg" title={asset.name}>
                          {asset.name}
                        </p>
                        <p className="mt-0.5 flex items-center justify-between gap-2 text-overline uppercase text-fg-subtle">
                          <span>{asset.kind}</span>
                          {asset.width && asset.height ? (
                            <span className="tabular font-mono">
                              {asset.width}×{asset.height}
                            </span>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
                        <button
                          type="button"
                          onClick={() => void toggleSpare(asset.id)}
                          aria-pressed={asset.spare}
                          className={cx(
                            "cursor-pointer rounded-sm px-1 text-label font-medium transition-colors",
                            asset.spare ? "text-warning hover:text-fg" : "text-fg-muted hover:text-fg",
                          )}
                        >
                          {asset.spare ? "Unmark spare" : "Mark spare"}
                        </button>

                        <IconButton
                          label={`Delete ${asset.name}`}
                          icon="trash"
                          size="sm"
                          className="text-fg-subtle hover:bg-destructive-subtle hover:text-destructive"
                          onClick={() => void deleteAsset(asset.id)}
                        />
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
