# AI Provider Layer — spec

## Interface (packages/ai)
```ts
interface AIProvider {
  id: string;                     // user-chosen label, e.g. "claude-main", "ollama-home"
  kind: "anthropic" | "openai" | "gemini" | "ollama" | "openai-compatible" | "openrouter";
  baseUrl?: string;               // required for ollama / openai-compatible
  model: string;                  // e.g. "claude-sonnet-4-5", "gpt-4o", "gemini-2.0-flash", "llava:13b"
  supportsVision: boolean;
  maxImagesPerRequest: number;    // provider limit; used for batching
  chat(req: { system?: string; messages: Msg[]; json?: boolean; maxTokens?: number }): Promise<string>;
  vision(req: { text: string; images: { b64: string; mime: string; label: string }[]; json?: boolean }): Promise<string>;
  testConnection(): Promise<{ ok: boolean; message: string; latencyMs: number }>;
  estimateCost(req): { inputTokens: number; usd?: number };
}
```
Adapters:
- **Anthropic** — Messages API, `x-api-key`, images as base64 blocks; browser
  calls allowed with `anthropic-dangerous-direct-browser-access: true`.
- **OpenAI** — Chat Completions with `image_url` data URIs; `response_format:
  json_object` when `json`.
- **Gemini** — `generateContent` with `inlineData`; API key in query/header.
- **Ollama** — `/api/chat` with `images: [b64]`; base URL default
  `http://127.0.0.1:11434`; remind the user to set `OLLAMA_ORIGINS=*` for
  browser access; vision models: llava, llama3.2-vision, qwen2.5-vl, minicpm-v.
- **OpenAI-compatible** — LM Studio, vLLM, LocalAI, Groq, Together, etc.: same
  as OpenAI with a custom base URL.
- **OpenRouter** — OpenAI-compatible with `https://openrouter.ai/api/v1`.

Two roles in Settings, each pointing at any provider: **Vision** (matching,
image QA) and **Text** (beat suggestions, prompt writing, titles). They can be
the same provider.

## Key storage
- Browser: AES-GCM (WebCrypto) with a key derived (PBKDF2, 200k iterations)
  from a passphrase the user sets once per device; ciphertext in IndexedDB;
  decrypted only in memory for the session. "Forget keys" button.
- Agent: `config.json` next to the agent, `chmod 600` on Unix; never logged.
- Never in localStorage plaintext, never in the URL, never in git, never on
  Vercel. The optional CORS proxy route forwards the key header per request
  and does not persist anything.

## Matching prompt (vision)
System: *You match illustrations to the beats of a narrated video. Be exact and
literal about what is depicted.*

User content, in order:
1. Short instruction (below).
2. For each candidate: a text line `IMAGE <index> (file: name)` followed by
   the image (512 px longest side, JPEG q70).
3. `BEATS:` then for each beat: `BEAT <n>` / `excerpt:` (the words spoken) /
   `prompt:` (what the image was supposed to show).
4. Instruction: *For EVERY beat choose the ONE image whose content best
   depicts that beat's prompt and excerpt. Prefer the sharpest, most on-prompt
   variant when several show the same scene. Use each image for at most one
   beat unless there is truly no other candidate. Reply with ONLY JSON:*
   `{"matches": {"<beat>": <imageIndex>}, "confidence": {"<beat>": 0-1}, "notes": "..."}`

Batching: if candidates > `maxImagesPerRequest`, run in batches and then a
final "resolve conflicts" pass with only the contested beats and their top-2
images. Show the estimated cost before sending. Cache results by
(image hashes + beat text hash).

## Script-analysis prompts (text)
- **Suggest beats**: given the script and pacing rules (min/max seconds, words
  per beat), return beats as JSON with `text` copied verbatim (the app
  re-verifies word count) — never paraphrase narration.
- **Write image prompts**: given beats + a visual style guide string, return
  one prompt per beat that starts with the style phrase, describes one clear
  scene, and avoids text-in-image; JSON.
- **Flag long holds**: given beats with durations, return beats over the max
  with a suggested split point at a sentence boundary.
- **Title & hook** (optional): 5 title options + a 2-sentence hook.

## Failure handling
- Any provider error → readable toast with the provider's message and a
  "switch provider" shortcut; matching falls back to by-number results and
  leaves the rest unmatched (never guesses silently).
- Timeouts: 120 s vision, 60 s text; one automatic retry with backoff.
