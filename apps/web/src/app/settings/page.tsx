"use client";

import { useState } from "react";
import { useProviderStore, type StoredProvider } from "@/lib/providerStore";
import type { ProviderKind } from "@nva/ai";
import { Icon } from "@/components/Icon";
import { PageHeader, PageShell } from "@/components/PageHeader";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  SectionHeading,
} from "@/components/ui";

const PROVIDER_KINDS: { value: ProviderKind; label: string; needsBaseUrl: boolean }[] = [
  { value: "anthropic", label: "Anthropic", needsBaseUrl: false },
  { value: "openai", label: "OpenAI", needsBaseUrl: false },
  { value: "gemini", label: "Google Gemini", needsBaseUrl: false },
  { value: "ollama", label: "Ollama (local)", needsBaseUrl: true },
  {
    value: "openai-compatible",
    label: "OpenAI-compatible (LM Studio, vLLM, …)",
    needsBaseUrl: true,
  },
  { value: "openrouter", label: "OpenRouter", needsBaseUrl: false },
];

const ROLE_LABELS: Record<StoredProvider["role"], string> = {
  both: "Vision + text",
  vision: "Vision only",
  text: "Text only",
};

function AddProviderForm() {
  const addProvider = useProviderStore((s) => s.addProvider);
  const [kind, setKind] = useState<ProviderKind>("anthropic");
  const [label, setLabel] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [role, setRole] = useState<StoredProvider["role"]>("both");

  const meta = PROVIDER_KINDS.find((k) => k.value === kind)!;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !model.trim()) return;
    addProvider(
      {
        id: `${kind}-${label.trim().toLowerCase().replace(/\s+/g, "-")}`,
        kind,
        baseUrl: meta.needsBaseUrl ? baseUrl.trim() : undefined,
        model: model.trim(),
        role,
      },
      apiKey,
    );
    setLabel("");
    setModel("");
    setBaseUrl("");
    setApiKey("");
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <SectionHeading>Add a provider</SectionHeading>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider" htmlFor="provider-kind">
            <Select
              id="provider-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ProviderKind)}
            >
              {PROVIDER_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Label" htmlFor="provider-label" hint="How it appears in pickers.">
            <Input
              id="provider-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="claude-main"
              required
            />
          </Field>

          <Field label="Model" htmlFor="provider-model">
            <Input
              id="provider-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-sonnet-4-5"
              required
            />
          </Field>

          <Field label="Role" htmlFor="provider-role">
            <Select
              id="provider-role"
              value={role}
              onChange={(e) => setRole(e.target.value as StoredProvider["role"])}
            >
              <option value="both">Vision + text</option>
              <option value="vision">Vision only — image matching</option>
              <option value="text">Text only — script and prompt work</option>
            </Select>
          </Field>

          {meta.needsBaseUrl ? (
            <Field label="Base URL" htmlFor="provider-url">
              <Input
                id="provider-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:11434"
                required
              />
            </Field>
          ) : null}

          <Field
            label="API key"
            htmlFor="provider-key"
            hint={kind === "ollama" ? "Usually not needed for local Ollama." : undefined}
          >
            <Input
              id="provider-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-1.5 text-label text-fg-muted">
            <Icon name="info" size={13} className="mt-0.5 shrink-0" />
            <span className="max-w-prose">
              Keys are held in memory for this session only. They are sent to the provider you
              choose and nowhere else — never written to the repo, never sent to Vercel.
            </span>
          </p>
          <Button
            type="submit"
            variant="primary"
            icon="plus"
            disabled={!label.trim() || !model.trim()}
            className="shrink-0"
          >
            Add provider
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ProviderRow({ provider }: { provider: StoredProvider }) {
  const testProvider = useProviderStore((s) => s.testProvider);
  const removeProvider = useProviderStore((s) => s.removeProvider);
  const [testing, setTesting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function onTest() {
    setTesting(true);
    try {
      await testProvider(provider.id);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-body font-medium text-fg">{provider.id}</span>
          <Badge>{ROLE_LABELS[provider.role]}</Badge>
        </div>
        <p className="mt-0.5 font-mono text-label text-fg-muted">
          {provider.kind} · {provider.model}
        </p>
        {provider.lastTest ? (
          <p
            className={`mt-1 flex items-center gap-1 text-label ${
              provider.lastTest.ok ? "text-success" : "text-destructive"
            }`}
          >
            <Icon name={provider.lastTest.ok ? "check" : "alert"} size={12} />
            {provider.lastTest.message}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" loading={testing} onClick={() => void onTest()}>
          {testing ? "Testing…" : "Test connection"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          icon="trash"
          onClick={() => setConfirmRemove(true)}
        >
          Remove
        </Button>
      </div>

      <Modal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove provider"
        description={`"${provider.id}" will be removed, along with its key for this session.`}
        footer={
          <>
            <Button onClick={() => setConfirmRemove(false)}>Cancel</Button>
            <Button
              variant="destructive"
              icon="trash"
              onClick={() => {
                removeProvider(provider.id);
                setConfirmRemove(false);
              }}
            >
              Remove provider
            </Button>
          </>
        }
      >
        <p className="text-label text-fg-muted">
          Projects referencing this provider will fall back to asking you to pick another.
        </p>
      </Modal>
    </Card>
  );
}

export default function SettingsPage() {
  const providers = useProviderStore((s) => s.providers);

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Settings"
          description="Connect the AI providers used for script analysis and image matching. Bring your own key — nothing is proxied through a server."
        />

        <section className="flex flex-col gap-3">
          <SectionHeading>Your providers</SectionHeading>

          {providers.length === 0 ? (
            <EmptyState
              icon="settings"
              title="No providers connected"
              description="Add a provider below to enable AI prompt rewriting, script analysis, and image-to-beat matching. The rest of the app works without one."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {providers.map((p) => (
                <li key={p.id}>
                  <ProviderRow provider={p} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-6">
          <AddProviderForm />
        </div>
      </div>
    </PageShell>
  );
}
