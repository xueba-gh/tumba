"use client";

import { useState } from "react";
import { useProviderStore, type StoredProvider } from "@/lib/providerStore";
import type { ProviderKind } from "@nva/ai";

const PROVIDER_KINDS: { value: ProviderKind; label: string; needsBaseUrl: boolean }[] = [
  { value: "anthropic", label: "Anthropic", needsBaseUrl: false },
  { value: "openai", label: "OpenAI", needsBaseUrl: false },
  { value: "gemini", label: "Google Gemini", needsBaseUrl: false },
  { value: "ollama", label: "Ollama (local)", needsBaseUrl: true },
  { value: "openai-compatible", label: "OpenAI-compatible (LM Studio, vLLM, ...)", needsBaseUrl: true },
  { value: "openrouter", label: "OpenRouter", needsBaseUrl: false },
];

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
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-medium">Add a provider</h2>
      <label className="flex flex-col gap-1 text-sm">
        Provider
        <select
          className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
          value={kind}
          onChange={(e) => setKind(e.target.value as ProviderKind)}
        >
          {PROVIDER_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Label (e.g. "claude-main", "ollama-home")
        <input
          className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Model
        <input
          className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
          placeholder="e.g. claude-sonnet-4-5, gpt-4o, gemini-2.0-flash, llava:13b"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          required
        />
      </label>
      {meta.needsBaseUrl && (
        <label className="flex flex-col gap-1 text-sm">
          Base URL
          <input
            className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
            placeholder="http://127.0.0.1:11434"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            required
          />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">
        API key {kind === "ollama" && "(usually not needed for local Ollama)"}
        <input
          type="password"
          className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Role
        <select
          className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
          value={role}
          onChange={(e) => setRole(e.target.value as StoredProvider["role"])}
        >
          <option value="both">Vision + Text</option>
          <option value="vision">Vision only (image matching)</option>
          <option value="text">Text only (script/prompt work)</option>
        </select>
      </label>
      <button
        type="submit"
        className="mt-2 w-fit rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
      >
        Add provider
      </button>
      <p className="text-xs text-neutral-500">
        Keys are held only in memory for this session. Never sent anywhere except the
        provider you pick, never written to the repo, never sent to Vercel.
      </p>
    </form>
  );
}

function ProviderRow({ provider }: { provider: StoredProvider }) {
  const testProvider = useProviderStore((s) => s.testProvider);
  const removeProvider = useProviderStore((s) => s.removeProvider);
  const [testing, setTesting] = useState(false);

  async function onTest() {
    setTesting(true);
    try {
      await testProvider(provider.id);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div>
        <div className="text-sm font-medium">{provider.id}</div>
        <div className="text-xs text-neutral-500">
          {provider.kind} · {provider.model} · {provider.role}
        </div>
        {provider.lastTest && (
          <div className={`text-xs ${provider.lastTest.ok ? "text-green-600" : "text-red-600"}`}>
            {provider.lastTest.ok ? "✓ " : "✗ "}
            {provider.lastTest.message}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onTest}
          disabled={testing}
          className="rounded border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700"
        >
          {testing ? "Testing…" : "Test"}
        </button>
        <button
          onClick={() => removeProvider(provider.id)}
          className="rounded border border-neutral-300 px-3 py-1 text-xs text-red-600 dark:border-neutral-700"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const providers = useProviderStore((s) => s.providers);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <h1 className="text-xl font-semibold">Settings</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-500">Your providers</h2>
        {providers.length === 0 && (
          <p className="text-sm text-neutral-500">No providers added yet.</p>
        )}
        {providers.map((p) => (
          <ProviderRow key={p.id} provider={p} />
        ))}
      </section>
      <AddProviderForm />
    </main>
  );
}
