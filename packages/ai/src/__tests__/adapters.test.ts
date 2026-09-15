import { describe, it, expect, vi } from "vitest";
import { createProvider } from "../adapters.js";
import type { ProviderConfig } from "../types.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("createProvider — anthropic", () => {
  const cfg: ProviderConfig = { id: "a1", kind: "anthropic", model: "claude-sonnet-4-5", apiKey: "sk-test" };

  it("chat() sends x-api-key and parses text blocks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ content: [{ type: "text", text: "hello" }] }),
    );
    const provider = createProvider(cfg, fetchMock as unknown as typeof fetch);
    const reply = await provider.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(reply).toBe("hello");
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-test");
  });

  it("testConnection reports ok on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: "text", text: "ok" }] }));
    const provider = createProvider(cfg, fetchMock as unknown as typeof fetch);
    const result = await provider.testConnection();
    expect(result.ok).toBe(true);
  });

  it("testConnection reports failure with the provider's message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "bad key" }, false, 401));
    const provider = createProvider(cfg, fetchMock as unknown as typeof fetch);
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("401");
  });
});

describe("createProvider — openai-compatible", () => {
  const cfg: ProviderConfig = {
    id: "lmstudio",
    kind: "openai-compatible",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "local-model",
    apiKey: "",
  };

  it("chat() posts to /chat/completions with a Bearer header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: "reply" } }] }));
    const provider = createProvider(cfg, fetchMock as unknown as typeof fetch);
    const reply = await provider.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(reply).toBe("reply");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:1234/v1/chat/completions");
  });
});

describe("createProvider — ollama", () => {
  const cfg: ProviderConfig = { id: "o1", kind: "ollama", model: "llava", apiKey: "" };

  it("vision() sends images as a base64 array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: { content: "matched" } }));
    const provider = createProvider(cfg, fetchMock as unknown as typeof fetch);
    const reply = await provider.vision({
      text: "match these",
      images: [{ b64: "AAAA", mime: "image/jpeg", label: "IMAGE 0" }],
    });
    expect(reply).toBe("matched");
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].images).toEqual(["AAAA"]);
  });
});

describe("createProvider — gemini", () => {
  const cfg: ProviderConfig = { id: "g1", kind: "gemini", model: "gemini-2.0-flash", apiKey: "gkey" };

  it("chat() puts the key in the query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ candidates: [{ content: { parts: [{ text: "hi there" }] } }] }),
    );
    const provider = createProvider(cfg, fetchMock as unknown as typeof fetch);
    const reply = await provider.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(reply).toBe("hi there");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("key=gkey");
  });
});

describe("estimateCost", () => {
  it("estimates tokens from text length and image count", () => {
    const cfg: ProviderConfig = { id: "a1", kind: "anthropic", model: "m", apiKey: "k" };
    const provider = createProvider(cfg, vi.fn() as unknown as typeof fetch);
    const est = provider.estimateCost({
      text: "a".repeat(400),
      images: [{ b64: "x", mime: "image/jpeg", label: "l" }],
    });
    expect(est.inputTokens).toBe(Math.ceil(400 / 4) + 800);
  });
});
