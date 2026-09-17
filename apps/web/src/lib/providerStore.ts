"use client";

import { create } from "zustand";
import {
  KeyStore,
  createProvider,
  encryptSecret,
  decryptSecret,
  type ProviderConfig,
  type ProviderKind,
  type EncryptedBlob,
} from "@nva/ai";
import {
  saveEncryptedKey,
  loadEncryptedKeys,
  deleteEncryptedKey,
  deleteAllEncryptedKeys,
} from "./keyPersistence.js";

export interface StoredProvider {
  id: string;
  kind: ProviderKind;
  baseUrl?: string;
  model: string;
  role: "vision" | "text" | "both";
  lastTest?: { ok: boolean; message: string; at: string };
}

const PROVIDERS_LS_KEY = "nva-providers";

/** Load provider metadata from localStorage (never contains keys). */
function loadProvidersMeta(): StoredProvider[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROVIDERS_LS_KEY);
    return raw ? (JSON.parse(raw) as StoredProvider[]) : [];
  } catch {
    return [];
  }
}

/** Persist provider metadata to localStorage (never contains keys). */
function saveProvidersMeta(providers: StoredProvider[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROVIDERS_LS_KEY, JSON.stringify(providers));
  } catch {
    // Storage full or unavailable — not fatal.
  }
}

interface ProviderState {
  providers: StoredProvider[];
  keyStore: KeyStore;

  /** The passphrase for this session (kept in memory only). */
  passphrase: string | null;

  /** Whether encrypted keys have been loaded from IndexedDB. */
  keysRestored: boolean;

  /** Whether encrypted blobs exist on disk (even if not yet unlocked). */
  hasStoredKeys: boolean;

  /** Set the session passphrase and unlock any persisted keys. */
  setPassphrase: (passphrase: string) => Promise<{ unlocked: number; failed: number }>;

  /** Add a provider and persist its encrypted key. */
  addProvider: (p: StoredProvider, apiKey: string) => void;

  /** Remove a provider and its encrypted key. */
  removeProvider: (id: string) => void;

  /** Test a provider connection. */
  testProvider: (id: string) => Promise<void>;

  /** Wipe all keys from memory and IndexedDB. */
  forgetAllKeys: () => Promise<void>;

  /** Check for stored keys on disk (call on mount). */
  checkForStoredKeys: () => Promise<void>;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: loadProvidersMeta(),
  keyStore: new KeyStore(),
  passphrase: null,
  keysRestored: false,
  hasStoredKeys: false,

  checkForStoredKeys: async () => {
    try {
      const blobs = await loadEncryptedKeys();
      set({ hasStoredKeys: blobs.size > 0 });
    } catch {
      set({ hasStoredKeys: false });
    }
  },

  setPassphrase: async (passphrase: string) => {
    const { keyStore } = get();
    let unlocked = 0;
    let failed = 0;

    try {
      const blobs = await loadEncryptedKeys();
      for (const [providerId, blob] of blobs) {
        try {
          const plaintext = await decryptSecret(blob, passphrase);
          keyStore.set(providerId, plaintext);
          unlocked++;
        } catch {
          // Wrong passphrase for this blob — skip it.
          failed++;
        }
      }
    } catch {
      // IndexedDB unavailable — nothing to restore.
    }

    set({ passphrase, keysRestored: true });
    return { unlocked, failed };
  },

  addProvider: (p, apiKey) => {
    const { keyStore, passphrase } = get();
    keyStore.set(p.id, apiKey);

    const next = [...get().providers.filter((x) => x.id !== p.id), p];
    saveProvidersMeta(next);
    set({ providers: next, hasStoredKeys: true });

    // Encrypt and persist in the background — don't block the UI.
    if (passphrase) {
      encryptSecret(apiKey, passphrase)
        .then((blob) => saveEncryptedKey(p.id, blob))
        .catch(() => {
          // Encryption or IndexedDB failed — key lives in memory for this
          // session but won't survive a reload.  Not fatal.
        });
    }
  },

  removeProvider: (id) => {
    const next = get().providers.filter((p) => p.id !== id);
    saveProvidersMeta(next);
    set({ providers: next });

    // Clean up the encrypted key too.
    deleteEncryptedKey(id).catch(() => {});
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
    const providers = get().providers.map((p) =>
      p.id === id
        ? {
            ...p,
            lastTest: {
              ok: result.ok,
              message: result.message,
              at: new Date().toISOString(),
            },
          }
        : p,
    );
    saveProvidersMeta(providers);
    set({ providers });
  },

  forgetAllKeys: async () => {
    get().keyStore.forgetAll();
    try {
      await deleteAllEncryptedKeys();
    } catch {
      // IndexedDB wipe failed — not fatal, memory is already clear.
    }
    set({ passphrase: null, keysRestored: false, hasStoredKeys: false });
  },
}));
