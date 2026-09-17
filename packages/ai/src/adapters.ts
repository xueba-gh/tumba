import {
  AIProvider,
  ChatRequest,
  CostEstimate,
  FetchLike,
  ProviderConfig,
  ProviderError,
  TIMEOUT_TEXT_MS,
  TIMEOUT_VISION_MS,
  TestConnectionResult,
  VisionRequest,
  estimateTokens,
  withTimeoutAndRetry,
} from "./types.js";

const DEFAULT_MAX_IMAGES: Record<string, number> = {
  anthropic: 20,
  openai: 20,
  gemini: 16,
  ollama: 4,
  "openai-compatible": 8,
  openrouter: 20,
};

function baseUrlFor(cfg: ProviderConfig): string {
  if (cfg.baseUrl) return cfg.baseUrl.replace(/\/$/, "");
  switch (cfg.kind) {
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "openai":
      return "https://api.openai.com/v1";
    case "gemini":
      return "https://generativelanguage.googleapis.com/v1beta";
    case "ollama":
      return "http://127.0.0.1:11434";
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "openai-compatible":
      throw new ProviderError("openai-compatible requires a baseUrl", cfg.id);
  }
}

/**
 * A single adapter implementation whose request/response shaping branches
 * on provider kind. Anthropic, OpenAI, OpenAI-compatible and OpenRouter
 * share the OpenAI-ish JSON shape closely enough to stay in one function
 * per provider family; Gemini and Ollama get their own shaping.
 */
export function createProvider(cfg: ProviderConfig, fetchImpl: FetchLike = fetch): AIProvider {
  const base = cfg.baseUrl ? cfg.baseUrl.replace(/\/$/, "") : baseUrlFor(cfg);
  const maxImagesPerRequest = DEFAULT_MAX_IMAGES[cfg.kind] ?? 8;
  const supportsVision = true; // caller is responsible for picking a vision-capable model

  async function doFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    return withTimeoutAndRetry(
      async (signal) => {
        const res = await fetchImpl(url, { ...init, signal });
        if (!res.ok) {
          const bodyText = await res.text().catch(() => "");
          throw new ProviderError(
            `${cfg.kind} request failed (${res.status}): ${bodyText.slice(0, 300)}`,
            cfg.id,
          );
        }
        return res;
      },
      timeoutMs,
      1,
    );
  }

  async function chat(req: ChatRequest): Promise<string> {
    try {
      switch (cfg.kind) {
        case "anthropic":
          return await anthropicChat(req);
        case "gemini":
          return await geminiChat(req);
        case "ollama":
          return await ollamaChat(req);
        default:
          return await openaiChat(req);
      }
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(`${cfg.kind} chat failed: ${String(err)}`, cfg.id, err);
    }
  }

  async function vision(req: VisionRequest): Promise<string> {
    try {
      switch (cfg.kind) {
        case "anthropic":
          return await anthropicVision(req);
        case "gemini":
          return await geminiVision(req);
        case "ollama":
          return await ollamaVision(req);
        default:
          return await openaiVision(req);
      }
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(`${cfg.kind} vision failed: ${String(err)}`, cfg.id, err);
    }
  }

  // --- Anthropic -----------------------------------------------------
  async function anthropicChat(req: ChatRequest): Promise<string> {
    const res = await doFetch(
      `${base}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: req.maxTokens ?? 4000,
          system: req.system,
          messages: req.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      },
      TIMEOUT_TEXT_MS,
    );
    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    return data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  }

  async function anthropicVision(req: VisionRequest): Promise<string> {
    const content: unknown[] = [{ type: "text", text: req.text }];
    for (const img of req.images) {
      content.push({ type: "text", text: img.label });
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.mime, data: img.b64 },
      });
    }
    const res = await doFetch(
      `${base}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 4000,
          messages: [{ role: "user", content }],
        }),
      },
      TIMEOUT_VISION_MS,
    );
    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    return data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  }

  // --- OpenAI / OpenAI-compatible / OpenRouter ------------------------
  async function openaiChat(req: ChatRequest): Promise<string> {
    const messages = req.system ? [{ role: "system", content: req.system }, ...req.messages] : req.messages;
    const res = await doFetch(
      `${base}/chat/completions`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          max_tokens: req.maxTokens,
          ...(req.json ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      TIMEOUT_TEXT_MS,
    );
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content ?? "";
  }

  async function openaiVision(req: VisionRequest): Promise<string> {
    const content: unknown[] = [{ type: "text", text: req.text }];
    for (const img of req.images) {
      content.push({ type: "text", text: img.label });
      content.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.b64}` } });
    }
    const res = await doFetch(
      `${base}/chat/completions`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: "user", content }],
          ...(req.json ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      TIMEOUT_VISION_MS,
    );
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content ?? "";
  }

  // --- Gemini ----------------------------------------------------------
  async function geminiChat(req: ChatRequest): Promise<string> {
    const url = `${base}/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
    const res = await doFetch(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: req.system ? { parts: [{ text: req.system }] } : undefined,
          contents: req.messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
        }),
      },
      TIMEOUT_TEXT_MS,
    );
    const data = (await res.json()) as {
      candidates: { content: { parts: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }

  async function geminiVision(req: VisionRequest): Promise<string> {
    const url = `${base}/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
    const parts: unknown[] = [{ text: req.text }];
    for (const img of req.images) {
      parts.push({ text: img.label });
      parts.push({ inlineData: { mimeType: img.mime, data: img.b64 } });
    }
    const res = await doFetch(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }] }),
      },
      TIMEOUT_VISION_MS,
    );
    const data = (await res.json()) as {
      candidates: { content: { parts: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }

  // --- Ollama ------------------------------------------------------------
  async function ollamaChat(req: ChatRequest): Promise<string> {
    const messages = req.system ? [{ role: "system", content: req.system }, ...req.messages] : req.messages;
    const res = await doFetch(
      `${base}/api/chat`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: cfg.model, messages, stream: false }),
      },
      TIMEOUT_TEXT_MS,
    );
    const data = (await res.json()) as { message: { content: string } };
    return data.message?.content ?? "";
  }

  async function ollamaVision(req: VisionRequest): Promise<string> {
    const res = await doFetch(
      `${base}/api/chat`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: cfg.model,
          stream: false,
          messages: [
            {
              role: "user",
              content: [req.text, ...req.images.map((i) => i.label)].join("\n"),
              images: req.images.map((i) => i.b64),
            },
          ],
        }),
      },
      TIMEOUT_VISION_MS,
    );
    const data = (await res.json()) as { message: { content: string } };
    return data.message?.content ?? "";
  }

  async function testConnection(): Promise<TestConnectionResult> {
    const startedAt = Date.now();
    try {
      await chat({ messages: [{ role: "user", content: "Reply with the single word: ok" }], maxTokens: 10 });
      return { ok: true, message: "Connected", latencyMs: Date.now() - startedAt };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  /**
   * Every provider exposes a list endpoint, so the app asks rather than
   * shipping a table of ids that rots. Shapes differ:
   *   anthropic/openai/openrouter/compatible -> { data: [{ id }] }
   *   gemini -> { models: [{ name: "models/x", supportedGenerationMethods }] }
   *   ollama -> { models: [{ name }] }
   */
  async function listModels(): Promise<string[]> {
    try {
      if (cfg.kind === "gemini") {
        const res = await doFetch(
          `${base}/models?key=${encodeURIComponent(cfg.apiKey)}&pageSize=200`,
          { method: "GET" },
          TIMEOUT_TEXT_MS,
        );
        const body = (await res.json()) as {
          models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
        };
        return (body.models ?? [])
          .filter(
            (m) =>
              !m.supportedGenerationMethods ||
              m.supportedGenerationMethods.includes("generateContent"),
          )
          .map((m) => (m.name ?? "").replace(/^models\//, ""))
          .filter(Boolean);
      }

      if (cfg.kind === "ollama") {
        const res = await doFetch(`${base}/api/tags`, { method: "GET" }, TIMEOUT_TEXT_MS);
        const body = (await res.json()) as { models?: Array<{ name?: string }> };
        return (body.models ?? []).map((m) => m.name ?? "").filter(Boolean);
      }

      const headers: Record<string, string> =
        cfg.kind === "anthropic"
          ? {
              "x-api-key": cfg.apiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true",
            }
          : { authorization: `Bearer ${cfg.apiKey}` };

      const res = await doFetch(`${base}/models`, { method: "GET", headers }, TIMEOUT_TEXT_MS);
      const body = (await res.json()) as { data?: Array<{ id?: string }> };
      return (body.data ?? []).map((m) => m.id ?? "").filter(Boolean);
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(`${cfg.kind} listModels failed: ${String(err)}`, cfg.id, err);
    }
  }

  function estimateCost(req: ChatRequest | VisionRequest): CostEstimate {
    const text = "text" in req ? req.text : req.messages.map((m) => m.content).join(" ");
    const imageCount = "images" in req ? req.images.length : 0;
    const inputTokens = estimateTokens(text, imageCount);
    // No per-provider live pricing table in Phase 1; usd is left undefined
    // (shown to the user as "token estimate only") until Settings lets the
    // user pin a price per provider/model.
    return { inputTokens };
  }

  return {
    id: cfg.id,
    kind: cfg.kind,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    supportsVision,
    maxImagesPerRequest,
    chat,
    vision,
    testConnection,
    listModels,
    estimateCost,
  };
}
