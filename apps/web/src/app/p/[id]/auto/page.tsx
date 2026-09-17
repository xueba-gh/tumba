"use client";

import { useEffect, useState, use } from "react";
import type { Project } from "@nva/core";
import type { ProviderConfig } from "@nva/ai";
import { getProject } from "@/lib/projectStorage";
import { useProviderStore } from "@/lib/providerStore";
import { runPipeline, type PipelineResult, type StepStatus } from "@/lib/autoPipeline";
import { Icon, type IconName } from "@/components/Icon";
import { PageHeader, PageShell } from "@/components/PageHeader";
import { Badge, Button, Card, Field, SectionHeading, Select, cx } from "@/components/ui";

const STATE_ICON: Record<StepStatus["state"], IconName> = {
  pending: "clock",
  running: "clock",
  done: "check",
  skipped: "check",
  failed: "alert",
};

export default function AutoPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [project, setProject] = useState<Project | null>(null);
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [autoDownload, setAutoDownload] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);

  const providers = useProviderStore((s) => s.providers);
  const keyStore = useProviderStore((s) => s.keyStore);
  const visionProviders = providers.filter((p) => p.role === "vision" || p.role === "both");
  const [providerId, setProviderId] = useState<string>("");

  useEffect(() => {
    async function load() {
      const proj = await getProject(params.id);
      if (proj) setProject(proj);
    }
    void load();
  }, [params.id]);

  useEffect(() => {
    if (!providerId && visionProviders[0]) setProviderId(visionProviders[0].id);
  }, [visionProviders, providerId]);

  async function run() {
    if (!project) return;
    setRunning(true);
    setResult(null);
    setFatal(null);

    const meta = visionProviders.find((p) => p.id === providerId);
    const vision: ProviderConfig | undefined = meta
      ? {
          id: meta.id,
          kind: meta.kind,
          baseUrl: meta.baseUrl,
          model: meta.model,
          apiKey: keyStore.get(meta.id) ?? "",
        }
      : undefined;

    try {
      const res = await runPipeline(project.id, { vision }, setSteps);
      setResult(res);
      setProject(res.project);

      if (res.ok && res.render && autoDownload) {
        const url = URL.createObjectURL(res.render.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${res.project.name.toLowerCase().replace(/\s+/g, "_")}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setFatal(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  if (!project) return null;

  const failed = steps.find((s) => s.state === "failed");

  return (
    <PageShell>
      <PageHeader
        step="Automate"
        title="Run the whole pipeline"
        description="Beats, matching, timing and encoding in one pass. Stages that are already done are skipped, so re-running never undoes manual edits."
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card className="flex flex-col gap-3 p-4">
            <SectionHeading>Settings</SectionHeading>

            <Field
              label="Vision provider"
              htmlFor="auto-provider"
              hint={
                visionProviders.length === 0
                  ? "None configured — matching will rely on filename numbers only."
                  : "Used only for beats filename numbering cannot resolve."
              }
            >
              <Select
                id="auto-provider"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                disabled={visionProviders.length === 0 || running}
              >
                {visionProviders.length === 0 ? <option value="">No vision provider</option> : null}
                {visionProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.model}
                  </option>
                ))}
              </Select>
            </Field>

            <label className="flex cursor-pointer items-start gap-2 text-label text-fg">
              <input
                type="checkbox"
                checked={autoDownload}
                onChange={(e) => setAutoDownload(e.target.checked)}
                disabled={running}
                className="mt-0.5 cursor-pointer accent-accent"
              />
              Download the MP4 as soon as it finishes
            </label>

            <Button
              variant="primary"
              size="lg"
              icon="sparkles"
              loading={running}
              onClick={() => void run()}
            >
              {running ? "Running…" : "Run everything"}
            </Button>

            <p className="text-label text-fg-muted">
              Keep this tab open and in the foreground — encoding is throttled in background tabs.
            </p>
          </Card>
        </div>

        <div className="lg:col-span-7">
          <Card className="flex flex-col gap-3 p-4">
            <SectionHeading
              action={
                result ? (
                  <Badge
                    tone={result.ok ? "success" : "warning"}
                    icon={result.ok ? "check" : "alert"}
                  >
                    {result.ok ? "Finished" : "Stopped"}
                  </Badge>
                ) : undefined
              }
            >
              Progress
            </SectionHeading>

            {steps.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-label text-fg-muted">
                Not started. Each stage reports as it completes.
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {steps.map((s) => (
                  <li
                    key={s.id}
                    className={cx(
                      "flex items-start gap-2.5 rounded-md border px-3 py-2",
                      s.state === "failed"
                        ? "border-destructive bg-destructive-subtle"
                        : s.state === "running"
                          ? "border-accent bg-accent-subtle"
                          : "border-border",
                    )}
                  >
                    <span
                      className={cx(
                        "mt-0.5 shrink-0",
                        s.state === "done" || s.state === "skipped"
                          ? "text-success"
                          : s.state === "failed"
                            ? "text-destructive"
                            : s.state === "running"
                              ? "text-accent"
                              : "text-fg-subtle",
                      )}
                    >
                      {s.state === "running" ? (
                        <span
                          className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                          aria-hidden="true"
                        />
                      ) : (
                        <Icon name={STATE_ICON[s.state]} size={14} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-medium text-fg">{s.label}</p>
                      {s.detail ? (
                        <p className="mt-0.5 text-label text-fg-muted">{s.detail}</p>
                      ) : null}
                    </div>
                    {s.state === "skipped" ? <Badge>Skipped</Badge> : null}
                  </li>
                ))}
              </ol>
            )}

            {fatal ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive bg-destructive-subtle px-3 py-2 text-label text-destructive"
              >
                <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                {fatal}
              </div>
            ) : null}

            {failed ? (
              <p className="text-label text-fg-muted">
                The run stopped at <span className="font-medium text-fg">{failed.label}</span> —
                a later stage would only produce a broken video from bad input. Fix that step, then
                run again; finished stages are skipped.
              </p>
            ) : null}

            {result?.render ? (
              <Button
                variant="primary"
                icon="download"
                onClick={() => {
                  const url = URL.createObjectURL(result.render!.blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${project.name.toLowerCase().replace(/\s+/g, "_")}.mp4`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                Download MP4 again
              </Button>
            ) : null}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
