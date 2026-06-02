/**
 * Provider-agnostic LLM chat with structured (zod-validated) output + a
 * resilient fallback chain.
 *
 * The active provider + model are picked from environment variables:
 *   LLM_PROVIDER=openai | gemini | anthropic    (default: openai)
 *   LLM_MODEL=<provider-specific id>            (provider-specific default)
 *   LLM_FALLBACK=gemini,anthropic               (optional ordered fallbacks)
 *
 * Resilience (so a single transient hiccup doesn't surface as a canned
 * dialogue reply / failed generation):
 *   1. Each attempt has a soft timeout.
 *   2. Transient failures (429 / 5xx / network / empty-or-malformed JSON) are
 *      retried with exponential backoff on the SAME provider.
 *   3. If a provider is exhausted (or a non-retryable error like a 4xx), we
 *      fall through to the next provider that has an API key. The fallback
 *      provider uses ITS default model (LLM_MODEL only applies to the active
 *      provider, so it can't be a wrong model id on another provider).
 *
 * Each provider returns JSON guaranteed by its native structured-output
 * mechanism, then we re-validate with the supplied zod schema and return
 * a typed result.
 *
 * TTS (`/api/tts`) is ElevenLabs — not an LLM call and unaffected by this.
 */

import { z, type ZodType } from "zod";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

export type LLMProvider = "openai" | "gemini" | "anthropic";

export type LLMMessage = { role: "user" | "assistant"; content: string };

export interface ChatOptions<T> {
  /** System prompt — character behaviour, output format guidance, etc. */
  system: string;
  /** Multi-turn user/assistant history (most recent last). */
  messages: LLMMessage[];
  /** Zod schema the response is parsed + validated against. */
  schema: ZodType<T>;
  /** Stable identifier used as the structured-output schema name. */
  schemaName: string;
}

/** Cached client instances — one per provider, lazily built. */
let _openai: OpenAI | null = null;
let _gemini: GoogleGenAI | null = null;
let _anthropic: Anthropic | null = null;

function envTrim(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function isProvider(v: string): v is LLMProvider {
  return v === "openai" || v === "gemini" || v === "anthropic";
}

export function activeProvider(): LLMProvider {
  const raw = envTrim("LLM_PROVIDER")?.toLowerCase();
  if (raw && isProvider(raw)) return raw;
  return "openai";
}

/** Provider-specific default model — overridden by `LLM_MODEL` for the ACTIVE
 *  provider only. */
function defaultModelFor(p: LLMProvider): string {
  switch (p) {
    case "openai":
      return "gpt-5-mini";
    case "gemini":
      return "gemini-3-flash-preview";
    case "anthropic":
      return "claude-sonnet-4-6";
  }
}

export function activeModel(): string {
  return envTrim("LLM_MODEL") ?? defaultModelFor(activeProvider());
}

/** Does a SPECIFIC provider have a usable API key in env. */
function providerHasKey(p: LLMProvider): boolean {
  switch (p) {
    case "openai":
      return !!envTrim("OPENAI_API_KEY");
    case "gemini":
      return !!envTrim("GEMINI_API_KEY") || !!envTrim("GOOGLE_API_KEY");
    case "anthropic":
      return !!envTrim("ANTHROPIC_API_KEY");
  }
}

/**
 * Ordered fallback providers (after the active one) that actually have a key.
 * From `LLM_FALLBACK` (comma list) if set, else the other two in a stable
 * order. Providers without a key are dropped, so the chain is a safe no-op
 * when only one key is configured.
 */
function fallbackProviders(active: LLMProvider): LLMProvider[] {
  const raw = envTrim("LLM_FALLBACK");
  const order: LLMProvider[] = raw
    ? raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(isProvider)
    : (["openai", "gemini", "anthropic"] as LLMProvider[]).filter(
        (p) => p !== active,
      );
  // dedupe + drop active + keep only key-bearing providers
  const seen = new Set<LLMProvider>([active]);
  const out: LLMProvider[] = [];
  for (const p of order) {
    if (seen.has(p)) continue;
    seen.add(p);
    if (providerHasKey(p)) out.push(p);
  }
  return out;
}

/** True when ANY provider in the chain (active or fallback) has a key. The
 *  routes gate on this before calling `chat()`. */
export function hasLLMKey(): boolean {
  const active = activeProvider();
  if (providerHasKey(active)) return true;
  return fallbackProviders(active).length > 0;
}

// ─────────────────────────────────────────────────────────────
// Resilience helpers
// ─────────────────────────────────────────────────────────────

const RETRY_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Soft per-attempt timeout — the underlying request may keep running, but we
 *  stop awaiting it and treat it as a (retryable) failure. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[llm] ${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Whether an error is worth retrying on the same provider. Retry transient
 * failures (429 / 5xx / network / timeout) and our own empty/parse errors;
 * do NOT retry deterministic client/auth failures (other 4xx).
 */
function isRetryable(err: unknown): boolean {
  const status =
    (err as { status?: unknown })?.status ??
    (err as { code?: unknown })?.code;
  if (typeof status === "number") {
    if (status === 429 || status === 408 || status === 409) return true;
    if (status >= 500) return true;
    if (status >= 400) return false; // other 4xx: bad request / auth
  }
  // No numeric status → network / timeout / empty-response / JSON-parse glitch.
  return true;
}

/** Public chat entry point. Tries the active provider (with retries), then
 *  falls through to key-bearing fallback providers. */
export async function chat<T>(opts: ChatOptions<T>): Promise<T> {
  const active = activeProvider();
  const candidates: Array<{ provider: LLMProvider; model: string }> = [];
  if (providerHasKey(active)) {
    candidates.push({ provider: active, model: activeModel() });
  }
  for (const p of fallbackProviders(active)) {
    candidates.push({ provider: p, model: defaultModelFor(p) });
  }
  if (candidates.length === 0) {
    throw new Error("[llm] no provider has an API key");
  }

  let lastErr: unknown;
  for (const cand of candidates) {
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        return await withTimeout(
          chatOnce(cand.provider, cand.model, opts),
          ATTEMPT_TIMEOUT_MS,
          `${cand.provider}:${opts.schemaName}`,
        );
      } catch (err) {
        lastErr = err;
        const retryable = isRetryable(err);
        const moreAttempts = attempt < RETRY_ATTEMPTS - 1;
        if (retryable && moreAttempts) {
          // exp backoff + jitter: ~0.6s, ~1.2s
          await sleep(600 * 2 ** attempt + Math.floor(Math.random() * 250));
          continue;
        }
        // Non-retryable, or attempts exhausted → next provider.
        if (candidates.length > 1) {
          console.warn(
            `[llm] ${cand.provider} failed (${retryable ? "exhausted retries" : "non-retryable"}); trying next provider`,
            err instanceof Error ? err.message : err,
          );
        }
        break;
      }
    }
  }
  throw lastErr;
}

function chatOnce<T>(
  provider: LLMProvider,
  model: string,
  opts: ChatOptions<T>,
): Promise<T> {
  switch (provider) {
    case "openai":
      return chatOpenAI(opts, model);
    case "gemini":
      return chatGemini(opts, model);
    case "anthropic":
      return chatAnthropic(opts, model);
  }
}

// ─────────────────────────────────────────────────────────────
// OpenAI
// ─────────────────────────────────────────────────────────────

async function chatOpenAI<T>(opts: ChatOptions<T>, model: string): Promise<T> {
  if (!_openai) {
    const apiKey = envTrim("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    // maxRetries: 0 — our chat() layer owns retry/backoff + cross-provider
    // fallback, so the SDK's own retries don't stack (and delay the fallback).
    _openai = new OpenAI({ apiKey, maxRetries: 0 });
  }

  // OpenAI accepts a zod schema natively via the helper.
  const completion = await _openai.chat.completions.parse({
    model,
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages,
    ],
    response_format: zodResponseFormat(opts.schema, opts.schemaName),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (parsed === null || parsed === undefined) {
    throw new Error("[llm:openai] no parsed message");
  }
  return parsed as T;
}

// ─────────────────────────────────────────────────────────────
// Gemini
// ─────────────────────────────────────────────────────────────

async function chatGemini<T>(opts: ChatOptions<T>, model: string): Promise<T> {
  if (!_gemini) {
    const apiKey = envTrim("GEMINI_API_KEY") ?? envTrim("GOOGLE_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    _gemini = new GoogleGenAI({ apiKey });
  }

  // Gemini "contents" maps to the rolling chat history. system prompt
  // goes into `config.systemInstruction`. Map our roles → Gemini roles
  // (assistant → "model").
  const contents = opts.messages.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  const responseJsonSchema = zodToJSONSchemaForGemini(opts.schema);

  const response = await _gemini.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema,
      // Disable the implicit "thinking" pass on Gemini 2.5/3 Flash. We
      // ask the model for short conversational replies + a one-line
      // outcome bridge — neither benefits from internal reasoning
      // tokens, and turning them off drops total latency by several
      // seconds. Pro requires a minimum of 128; Flash supports 0.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const text = response.text;
  if (!text) throw new Error("[llm:gemini] empty response text");
  const raw: unknown = JSON.parse(text);
  return opts.schema.parse(raw);
}

// ─────────────────────────────────────────────────────────────
// Anthropic
// ─────────────────────────────────────────────────────────────

async function chatAnthropic<T>(opts: ChatOptions<T>, model: string): Promise<T> {
  if (!_anthropic) {
    const apiKey = envTrim("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    // maxRetries: 0 — see the OpenAI client note; our layer owns retries.
    _anthropic = new Anthropic({ apiKey, maxRetries: 0 });
  }

  const schemaForOutput = zodToJSONSchemaForAnthropic(opts.schema);

  // The SDK exposes a `messages.parse` helper with `output_config` for
  // strict JSON-schema-enforced output. We narrow the type with `any` for
  // the output_config because the helper API is newer than the declared
  // types in some SDK builds.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = _anthropic as any;
  const message = await client.messages.parse({
    model,
    max_tokens: 1024,
    // System prompt is the static, per-character cacheable prefix. Marking
    // it `ephemeral` opts it into Anthropic prompt caching so repeat turns
    // for the same character reuse the cached prefix (the dynamic per-turn
    // context lives in the user message, after this block).
    system: [
      {
        type: "text",
        text: opts.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: opts.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    output_config: {
      format: {
        type: "json_schema",
        schema: schemaForOutput,
      },
    },
  });

  const parsed = message.parsed_output;
  if (parsed === null || parsed === undefined) {
    throw new Error("[llm:anthropic] no parsed_output");
  }
  return opts.schema.parse(parsed);
}

// ─────────────────────────────────────────────────────────────
// Schema conversion helpers
// ─────────────────────────────────────────────────────────────

/**
 * Convert a zod schema → Gemini-compatible JSON Schema. Gemini accepts a
 * subset of draft 2020-12; `z.toJSONSchema` 4.x emits a compatible form.
 */
function zodToJSONSchemaForGemini(schema: ZodType<unknown>): unknown {
  return z.toJSONSchema(schema, {
    target: "draft-2020-12",
    unrepresentable: "any",
  });
}

/**
 * Convert a zod schema → Anthropic-compatible JSON Schema. Anthropic
 * tool inputs require draft 2020-12 with `additionalProperties: false`
 * on object schemas (default behaviour of zod 4 toJSONSchema).
 */
function zodToJSONSchemaForAnthropic(schema: ZodType<unknown>): unknown {
  return z.toJSONSchema(schema, {
    target: "draft-2020-12",
    unrepresentable: "any",
  });
}
