/**
 * Provider-agnostic AI client. See
 * docs/build-package/05_AI_PROVIDER_SPEC.md for the authoritative spec.
 */

export type ProviderKind =
  | "anthropic"
  | "openai"
  | "gemini"
  | "ollama"
  | "openai-compatible"
  | "openrouter";

export interface Msg {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  system?: string;
  messages: Msg[];
  json?: boolean;
  maxTokens?: number;
}

export interface VisionImage {
  b64: string;
  mime: string;
  label: string;
}

export interface VisionRequest {
  text: string;
  images: VisionImage[];
  json?: boolean;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  latencyMs: number;
}

export interface CostEstimate {
  inputTokens: number;
  usd?: number;
}

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  baseUrl?: string;
  model: string;
  apiKey: string;
}

export interface AIProvider {
  id: string;
  kind: ProviderKind;
  baseUrl?: string;
  model: string;
  supportsVision: boolean;
  maxImagesPerRequest: number;
  chat(req: ChatRequest): Promise<string>;
  vision(req: VisionRequest): Promise<string>;
  testConnection(): Promise<TestConnectionResult>;
  estimateCost(req: ChatRequest | VisionRequest): CostEstimate;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Fetch injection point so adapters are testable without a network. */
export type FetchLike = typeof fetch;

export const TIMEOUT_VISION_MS = 120_000;
export const TIMEOUT_TEXT_MS = 60_000;

export async function withTimeoutAndRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  retries = 1,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fn(controller.signal);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Rough token estimate: ~4 chars/token, images counted as a flat ~800 tokens each (provider-dependent). */
export function estimateTokens(text: string, imageCount = 0): number {
  return Math.ceil(text.length / 4) + imageCount * 800;
}
