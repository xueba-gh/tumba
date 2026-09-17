"use client";

import { useState, useEffect } from "react";
import { useProviderStore, type StoredProvider } from "@/lib/providerStore";
import { createProvider, type ProviderConfig, type ProviderKind } from "@nva/ai";
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

/**
 * Offline fallback only — "Load models" queries the provider for the real
 * list. Kept short and current because any hardcoded table goes stale:
 * providers retire ids and restrict others to existing users.
 * Verified September 2026.
 */
const MODEL_SUGGESTIONS: Record<ProviderKind, string[]> = {
  anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  openai: ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
  gemini: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"],
  ollama: ["llava:13b", "llama3.2-vision", "qwen2.5vl"],
  "openai-compatible": ["local-model"],
  openrouter: ["anthropic/claude-opus-5", "google/gemini-3.8-flash"],
};

/** Catches the common paste-the-display-name mistake before a request is spent. */
function modelIdProblem(model: string): string | null {
  const v = model.trim();
  if (!v) return null;
  if (/\s/.test(v)) {
    return "Model ids have no spaces — use the provider's exact id, e.g. gemini-3.8-flash.";
  }
  if (/[A-Z]/.test(v) && !v.includes("/")) {
    return "Model ids are normally lowercase — double-check this matches the provider's id.";
  }
  return null;
}

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

  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const kindMeta = PROVIDER_KINDS.find((k) => k.value === kind)!;
  // The live list wins when we have one; the static table is the offline path.
  const suggestions = fetchedModels ?? MODEL_SUGGESTIONS[kind] ?? [];
  const meta = { ...kindMeta, suggestions };
  const modelProblem = modelIdProblem(model);

  /** Ask the provider which models this key can actually call. */
  async function loadModels() {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const cfg: ProviderConfig = {
        id: "model-probe",
        kind,
        baseUrl: kindMeta.needsBaseUrl ? baseUrl.trim() || undefined : undefined,
        model: model.trim() || "probe",
        apiKey: apiKey.trim(),
      };
      const ids = await createProvider(cfg).listModels();
      if (ids.length === 0) {
        setModelsError("The provider returned no models for this key.");
        return;
      }
      setFetchedModels(ids);
      if (!model.trim() && ids[0]) setModel(ids[0]);
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingModels(false);
    }
  }

  // A different provider's models are meaningless; drop them on switch.
  function changeKind(next: ProviderKind) {
    setKind(next);
    setFetchedModels(null);
    setModelsError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !model.trim()) return;
    if (modelIdProblem(model)?.startsWith("Model ids have no spaces")) return;
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
              onChange={(e) => changeKind(e.target.value as ProviderKind)}
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

          <Field
            label="Model"
            htmlFor="provider-model"
            hint={
              modelProblem
                ? undefined
                : fetchedModels
                  ? `${fetchedModels.length} models available to this key.`
                  : "Enter your key, then load the models this key can call."
            }
            error={modelProblem ?? modelsError ?? undefined}
          >
            <div className="flex items-center gap-2">
              <Input
                id="provider-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                list="model-suggestions"
                placeholder={meta.suggestions[0]}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                required
              />
              <Button
                size="sm"
                icon="download"
                loading={loadingModels}
                disabled={!apiKey.trim() && kind !== "ollama"}
                onClick={() => void loadModels()}
                className="shrink-0"
              >
                Load
              </Button>
            </div>
            <datalist id="model-suggestions">
              {meta.suggestions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
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
              Keys are encrypted (AES-GCM) with your passphrase and stored locally. They are
              sent to the provider you choose and nowhere else — never written to the repo,
              never sent to Vercel.
            </span>
          </p>
          <Button
            type="submit"
            variant="primary"
            icon="plus"
            disabled={!label.trim() || !model.trim() || /\s/.test(model.trim())}
            className="shrink-0"
          >
            Add provider
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PassphraseCard() {
  const hasStoredKeys = useProviderStore((s) => s.hasStoredKeys);
  const keysRestored = useProviderStore((s) => s.keysRestored);
  const setPassphrase = useProviderStore((s) => s.setPassphrase);
  const checkForStoredKeys = useProviderStore((s) => s.checkForStoredKeys);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    void checkForStoredKeys();
  }, [checkForStoredKeys]);

  // Don't show if keys are already unlocked or there's nothing to unlock.
  if (keysRestored || !hasStoredKeys) return null;

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setUnlocking(true);
    setStatus(null);
    try {
      const { unlocked, failed } = await setPassphrase(input.trim());
      if (unlocked > 0 && failed === 0) {
        setStatus(`Unlocked ${unlocked} key${unlocked > 1 ? "s" : ""}.`);
      } else if (unlocked > 0) {
        setStatus(`Unlocked ${unlocked}, failed ${failed} — some keys may use a different passphrase.`);
      } else {
        setStatus("Could not unlock any keys — wrong passphrase?");
      }
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <Card className="border-warning/40 bg-warning/5 p-4">
      <form onSubmit={handleUnlock} className="flex flex-col gap-3">
        <SectionHeading>Unlock saved keys</SectionHeading>
        <p className="text-label text-fg-muted">
          You have encrypted API keys stored from a previous session. Enter your passphrase to
          unlock them.
        </p>
        <div className="flex items-center gap-2">
          <Input
            id="unlock-passphrase"
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Passphrase"
            autoComplete="off"
            required
            className="flex-1"
          />
          <Button type="submit" variant="primary" loading={unlocking} className="shrink-0">
            Unlock
          </Button>
        </div>
        {status ? (
          <p className="text-label text-fg-muted">{status}</p>
        ) : null}
      </form>
    </Card>
  );
}

function SetPassphraseCard() {
  const passphrase = useProviderStore((s) => s.passphrase);
  const setPassphrase = useProviderStore((s) => s.setPassphrase);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);

  // If a passphrase is already set, don't show this card.
  if (passphrase) return null;

  function handleSet(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    void setPassphrase(input.trim());
    setDone(true);
  }

  if (done) return null;

  return (
    <Card className="p-4">
      <form onSubmit={handleSet} className="flex flex-col gap-3">
        <SectionHeading>Set a passphrase</SectionHeading>
        <p className="text-label text-fg-muted">
          Choose a passphrase to encrypt your API keys at rest. You&apos;ll enter it once per
          session to unlock your keys.
        </p>
        <div className="flex items-center gap-2">
          <Input
            id="set-passphrase"
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Choose a passphrase"
            autoComplete="off"
            required
            className="flex-1"
          />
          <Button type="submit" variant="primary" className="shrink-0">
            Set passphrase
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ProviderRow({ provider }: { provider: StoredProvider }) {
  const testProvider = useProviderStore((s) => s.testProvider);
  const removeProvider = useProviderStore((s) => s.removeProvider);
  const keyStore = useProviderStore((s) => s.keyStore);
  const [testing, setTesting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const hasKey = !!keyStore.get(provider.id);

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
          {hasKey ? (
            <Badge className="bg-success/10 text-success">
              <Icon name="check" size={10} />
              key loaded
            </Badge>
          ) : (
            <Badge className="bg-warning/10 text-warning">
              <Icon name="alert" size={10} />
              key locked
            </Badge>
          )}
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
        <Button size="sm" loading={testing} disabled={!hasKey} onClick={() => void onTest()}>
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
        description={`"${provider.id}" will be removed, along with its encrypted key.`}
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
  const forgetAllKeys = useProviderStore((s) => s.forgetAllKeys);
  const passphrase = useProviderStore((s) => s.passphrase);
  const [confirmForget, setConfirmForget] = useState(false);

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Settings"
          description="Connect the AI providers used for script analysis and image matching. Bring your own key — nothing is proxied through a server."
        />

        {/* Passphrase unlock — shown when encrypted keys exist but haven't been unlocked */}
        <PassphraseCard />

        {/* Passphrase setup — shown when no passphrase is set for this session */}
        {providers.length > 0 ? <SetPassphraseCard /> : null}

        <section className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionHeading>Your providers</SectionHeading>
            {providers.length > 0 ? (
              <Button
                size="sm"
                variant="destructive"
                icon="trash"
                onClick={() => setConfirmForget(true)}
              >
                Forget all keys
              </Button>
            ) : null}
          </div>

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

        {passphrase ? (
          <p className="mt-4 flex items-center gap-1.5 text-label text-fg-muted">
            <Icon name="check" size={12} className="text-success" />
            Passphrase set — new keys will be encrypted and stored across sessions.
          </p>
        ) : null}
      </div>

      <Modal
        open={confirmForget}
        onClose={() => setConfirmForget(false)}
        title="Forget all keys"
        description="This will wipe every API key from memory and encrypted storage. You'll need to re-enter them."
        footer={
          <>
            <Button onClick={() => setConfirmForget(false)}>Cancel</Button>
            <Button
              variant="destructive"
              icon="trash"
              onClick={() => {
                void forgetAllKeys();
                setConfirmForget(false);
              }}
            >
              Forget all keys
            </Button>
          </>
        }
      >
        <p className="text-label text-fg-muted">
          Provider configurations will remain, but their API keys will be permanently deleted.
        </p>
      </Modal>
    </PageShell>
  );
}
