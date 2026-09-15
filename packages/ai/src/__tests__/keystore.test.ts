import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, KeyStore } from "../keystore.js";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret with the correct passphrase", async () => {
    const blob = await encryptSecret("sk-super-secret", "correct horse battery staple");
    const plain = await decryptSecret(blob, "correct horse battery staple");
    expect(plain).toBe("sk-super-secret");
  });

  it("fails to decrypt with the wrong passphrase", async () => {
    const blob = await encryptSecret("sk-super-secret", "right passphrase");
    await expect(decryptSecret(blob, "wrong passphrase")).rejects.toThrow();
  });

  it("never stores plaintext in the blob", async () => {
    const blob = await encryptSecret("sk-super-secret", "pw");
    expect(JSON.stringify(blob)).not.toContain("sk-super-secret");
  });
});

describe("KeyStore", () => {
  it("unlocks a provider's key from an encrypted blob", async () => {
    const blob = await encryptSecret("sk-abc", "pw");
    const store = new KeyStore();
    await store.unlock("provider1", blob, "pw");
    expect(store.get("provider1")).toBe("sk-abc");
  });

  it("forgetAll wipes every key from memory", async () => {
    const store = new KeyStore();
    store.set("p1", "key1");
    store.set("p2", "key2");
    store.forgetAll();
    expect(store.get("p1")).toBeUndefined();
    expect(store.get("p2")).toBeUndefined();
  });
});
