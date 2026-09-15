/**
 * Encrypted key storage: AES-GCM (WebCrypto) with a key derived via PBKDF2
 * (200k iterations) from a user passphrase. Ciphertext is handed back to
 * the caller to persist (IndexedDB in the browser); this module never
 * touches storage itself so it stays testable in plain Node.
 * See docs/build-package/05_AI_PROVIDER_SPEC.md §Key storage.
 */

const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedBlob {
  /** base64 */
  salt: string;
  /** base64 */
  iv: string;
  /** base64 */
  ciphertext: string;
}

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtle();
  const keyMaterial = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function getSubtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error("WebCrypto is not available in this environment");
  }
  return c.subtle;
}

function getRandomValues(bytes: Uint8Array): Uint8Array {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c) throw new Error("WebCrypto is not available in this environment");
  return c.getRandomValues(bytes);
}

export async function encryptSecret(plaintext: string, passphrase: string): Promise<EncryptedBlob> {
  const salt = getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const subtle = getSubtle();
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return { salt: toB64(salt), iv: toB64(iv), ciphertext: toB64(ciphertext) };
}

export async function decryptSecret(blob: EncryptedBlob, passphrase: string): Promise<string> {
  const salt = fromB64(blob.salt);
  const iv = fromB64(blob.iv);
  const key = await deriveKey(passphrase, salt);
  const subtle = getSubtle();
  try {
    const plaintext = await subtle.decrypt({ name: "AES-GCM", iv }, key, fromB64(blob.ciphertext));
    return new TextDecoder().decode(plaintext);
  } catch (err) {
    throw new Error("Could not decrypt — wrong passphrase or corrupted data");
  }
}

/**
 * In-memory key store for the current session. Callers persist the
 * encrypted blobs (e.g. to IndexedDB) separately; this class only ever
 * holds decrypted keys in memory, never in localStorage or plaintext.
 */
export class KeyStore {
  private decrypted = new Map<string, string>();

  async unlock(providerId: string, blob: EncryptedBlob, passphrase: string): Promise<void> {
    const key = await decryptSecret(blob, passphrase);
    this.decrypted.set(providerId, key);
  }

  set(providerId: string, plaintextKey: string): void {
    this.decrypted.set(providerId, plaintextKey);
  }

  get(providerId: string): string | undefined {
    return this.decrypted.get(providerId);
  }

  /** "Forget keys" — wipes everything from memory for this session. */
  forgetAll(): void {
    this.decrypted.clear();
  }
}
