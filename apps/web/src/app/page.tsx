"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Aspect } from "@nva/core";
import {
  listProjects,
  createProject,
  renameProject,
  deleteProject,
  duplicateProject,
  exportProjectZipBlob,
  importProjectZipFile,
  linkLocalFolder,
  saveProject,
  type ProjectSummary,
} from "@/lib/projectStorage";
import { Icon } from "@/components/Icon";
import { PageHeader, PageShell } from "@/components/PageHeader";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
} from "@/components/ui";

const ASPECTS: Array<{ value: Aspect; label: string }> = [
  { value: "16:9", label: "16:9 landscape — YouTube, desktop" },
  { value: "9:16", label: "9:16 vertical — Shorts, TikTok, Reels" },
  { value: "1:1", label: "1:1 square — Instagram, feed posts" },
];

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} · ${d.toLocaleTimeString(
    [],
    { hour: "2-digit", minute: "2-digit" },
  )}`;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAspect, setNewAspect] = useState<Aspect>("16:9");
  const [creating, setCreating] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await listProjects());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const proj = await createProject(newName.trim(), newAspect);
      setShowCreate(false);
      setNewName("");
      router.push(`/p/${proj.id}/import`);
    } finally {
      setCreating(false);
    }
  }

  async function handleImportZip(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const proj = await importProjectZipFile(file);
      await loadProjects();
      router.push(`/p/${proj.id}/import`);
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleExportZip(id: string, name: string) {
    setError(null);
    setBusyId(id);
    try {
      const blob = await exportProjectZipBlob(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.toLowerCase().replace(/\s+/g, "_")}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(id: string) {
    setBusyId(id);
    try {
      const proj = await duplicateProject(id);
      await loadProjects();
      router.push(`/p/${proj.id}/import`);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteProject(pendingDelete.id);
    setPendingDelete(null);
    await loadProjects();
  }

  async function handleRenameSubmit(id: string) {
    if (!renameValue.trim()) return;
    await renameProject(id, renameValue.trim());
    setRenamingId(null);
    await loadProjects();
  }

  async function handleLinkFolder() {
    const folder = await linkLocalFolder();
    if (folder) setNotice(`Linked folder "${folder.name}" — its files are available to your projects.`);
  }

  async function handleCreateSample() {
    const sample = await createProject("Sample Video Project", "16:9");
    sample.script.text =
      "Mrs. Benn walked into the room slowly. The autumn twilight cast long shadows across the floor. " +
      "She picked up the old dusty book and opened it to the first page.";
    sample.beats = [
      {
        n: 1,
        text: "Mrs. Benn walked into the room slowly. The autumn twilight cast long shadows across the floor.",
        type: "image",
        prompt: "Cinematic portrait of Mrs. Benn walking into an autumn illuminated room, warm glow",
      },
      {
        n: 2,
        text: "She picked up the old dusty book and opened it to the first page.",
        type: "image",
        prompt: "Close-up of hands opening a vintage dusty leather book in warm light",
      },
    ];
    sample.audio.durationSec = 14.2;
    await saveProject(sample);
    await loadProjects();
    router.push(`/p/${sample.id}/script`);
  }

  return (
    <PageShell>
      <PageHeader
        title="Projects"
        description="Everything stays on this device — projects are stored in your browser and exported as .zip when you want to move them."
        actions={
          <>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportZip}
              accept=".zip"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
            <Button icon="upload" onClick={() => fileInputRef.current?.click()}>
              Import .zip
            </Button>
            <Button icon="folder" onClick={handleLinkFolder}>
              Link folder
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setShowCreate(true)}>
              New project
            </Button>
          </>
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

      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading projects">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[66px] animate-pulse rounded-lg border border-border bg-surface" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon="film"
          title="No projects yet"
          description="A project holds your narration, script, and images. Create an empty one, or load the sample to see the pipeline end to end."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" icon="plus" onClick={() => setShowCreate(true)}>
                Create project
              </Button>
              <Button icon="sparkles" onClick={handleCreateSample}>
                Load sample
              </Button>
            </div>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((p) => {
            const busy = busyId === p.id;
            return (
              <li key={p.id}>
                <Card className="flex flex-col gap-3 px-4 py-3 transition-colors hover:border-border-strong sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    {renamingId === p.id ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void handleRenameSubmit(p.id);
                        }}
                      >
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          aria-label={`Rename ${p.name}`}
                          autoFocus
                          className="max-w-xs"
                        />
                        <Button type="submit" variant="primary" size="sm">
                          Save
                        </Button>
                        <Button size="sm" onClick={() => setRenamingId(null)}>
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/p/${p.id}/import`}
                          className="truncate rounded-sm text-body font-medium text-fg transition-colors hover:text-accent"
                        >
                          {p.name}
                        </Link>
                        <Badge>{p.aspect}</Badge>
                      </div>
                    )}
                    <p className="mt-0.5 text-label text-fg-subtle">
                      Updated {formatUpdated(p.updatedAt)}
                    </p>
                  </div>

                  <dl className="flex shrink-0 items-center gap-4 text-label text-fg-muted">
                    <div className="flex items-baseline gap-1.5">
                      <dd className="tabular font-mono text-data font-medium text-fg">{p.beatCount}</dd>
                      <dt>beats</dt>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <dd className="tabular font-mono text-data font-medium text-fg">{p.assetCount}</dd>
                      <dt>assets</dt>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <dd className="tabular font-mono text-data font-medium text-fg">
                        {p.durationSec > 0 ? `${p.durationSec.toFixed(1)}s` : "—"}
                      </dd>
                      <dt>audio</dt>
                    </div>
                  </dl>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <IconButton
                      label={`Rename ${p.name}`}
                      icon="pencil"
                      size="sm"
                      onClick={() => {
                        setRenamingId(p.id);
                        setRenameValue(p.name);
                      }}
                    />
                    <IconButton
                      label={`Duplicate ${p.name}`}
                      icon="copy"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleDuplicate(p.id)}
                    />
                    <IconButton
                      label={`Export ${p.name} as .zip`}
                      icon="download"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleExportZip(p.id, p.name)}
                    />
                    <IconButton
                      label={`Delete ${p.name}`}
                      icon="trash"
                      size="sm"
                      className="text-fg-subtle hover:bg-destructive-subtle hover:text-destructive"
                      onClick={() => setPendingDelete(p)}
                    />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create project"
        description="You can change the aspect ratio later."
      >
        <form id="create-project" onSubmit={handleCreate} className="flex flex-col gap-4">
          <Field label="Project name" htmlFor="project-name">
            <Input
              id="project-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="History Explainer, episode 1"
              autoFocus
              required
            />
          </Field>

          <Field label="Aspect ratio" htmlFor="project-aspect">
            <Select
              id="project-aspect"
              value={newAspect}
              onChange={(e) => setNewAspect(e.target.value as Aspect)}
            >
              {ASPECTS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>
        </form>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button
            type="submit"
            form="create-project"
            variant="primary"
            loading={creating}
            disabled={!newName.trim()}
          >
            Create project
          </Button>
        </div>
      </Modal>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete project"
        description={
          pendingDelete
            ? `"${pendingDelete.name}" and its imported media will be removed from this device. This cannot be undone.`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" icon="trash" onClick={() => void confirmDelete()}>
              Delete project
            </Button>
          </>
        }
      >
        <p className="text-label text-fg-muted">
          Export a .zip first if you want to keep a copy.
        </p>
      </Modal>
    </PageShell>
  );
}
