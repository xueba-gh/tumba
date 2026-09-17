"use client";

import type { EncryptedBlob } from "@nva/ai";

/**
 * IndexedDB persistence for encrypted API-key blobs.
 *
 * Each provider's key is encrypted in memory (AES-GCM via keystore.ts) and the
 * resulting EncryptedBlob is stored here.  Decrypted keys never touch IndexedDB
 * — only ciphertext lives on disk.
 */

const DB_NAME = "nva-key-store";
const DB_VERSION = 1;
const STORE_NAME = "encrypted-keys";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist an encrypted blob for a provider. */
export async function saveEncryptedKey(
  providerId: string,
  blob: EncryptedBlob,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, providerId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Load all encrypted blobs.  Returns a map of providerId → EncryptedBlob. */
export async function loadEncryptedKeys(): Promise<
  Map<string, EncryptedBlob>
> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const result = new Map<string, EncryptedBlob>();

    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        result.set(cursor.key as string, cursor.value as EncryptedBlob);
        cursor.continue();
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Delete the encrypted blob for one provider. */
export async function deleteEncryptedKey(
  providerId: string,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(providerId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Wipe every encrypted key from IndexedDB. */
export async function deleteAllEncryptedKeys(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
