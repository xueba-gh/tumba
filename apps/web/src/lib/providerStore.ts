"use client";

import { create } from "zustand";
import { KeyStore, createProvider, type ProviderConfig, type ProviderKind } from "@nva/ai";

export interface StoredProvider {
  id: string;
  kind: ProviderKind;
  baseUrl?: string;
  model: string;
  role: "vision" | "text" | "both";
  lastTest?: { ok: boolean; message: string; at: string };
}

interface ProviderState {
  providers: StoredProvider[];
  keyStore: KeyStore;
  addProvider: (p: StoredProvider, apiKey: string) => void;
  removeProvider: (id: string) => void;
  testProvider: (id: string) => Promise<void>;
}

// Keys live only in the in-memory KeyStore for this session (see
// docs/build-package/05_AI_PROVIDER_SPEC.md §Key storage). Persisting the
// encrypted blobs to IndexedDB is wired up once the Settings UI has a
// passphrase-unlock flow — tracked as a follow-up, not blocking Phase 1.
export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  keyStore: new KeyStore(),
  addProvider: (p, apiKey) => {
    get().keyStore.set(p.id, apiKey);
    set((s) => ({ providers: [...s.providers.filter((x) => x.id !== p.id), p] }));
  },
  removeProvider: (id) => {
    set((s) => ({ providers: s.providers.filter((p) => p.id !== id) }));
  },
  testProvider: async (id) => {
    const state = get();
    const stored = state.providers.find((p) => p.id === id);
    if (!stored) return;
    const cfg: ProviderConfig = {
      id: stored.id,
      kind: stored.kind,
      baseUrl: stored.baseUrl,
      model: stored.model,
      apiKey: state.keyStore.get(id) ?? "",
    };
    const provider = createProvider(cfg);
    const result = await provider.testConnection();
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === id
          ? { ...p, lastTest: { ok: result.ok, message: result.message, at: new Date().toISOString() } }
          : p,
      ),
    }));
  },
}));
