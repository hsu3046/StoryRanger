/**
 * Provider-agnostic LLM chat with structured (zod-validated) output.
 *
 * The active provider + model are picked from environment variables:
 *   LLM_PROVIDER=openai | gemini | anthropic    (default: openai)
 *   LLM_MODEL=<provider-specific id>            (provider-specific default)
 *
 * Each provider returns JSON guaranteed by its native structured-output
 * mechanism, then we re-validate with the supplied zod schema and return
 * a typed result.
 *
 * TTS (`/api/tts`) is still OpenAI-only — it's not an LLM call and is
 * unaffected by this abstraction.
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

export function activeProvider(): LLMProvider {
  const raw = envTrim("LLM_PROVIDER")?.toLowerCase();
  if (raw === "gemini" || raw === "anthropic" || raw === "openai") return raw;
  return "openai";
}

/** Provider-specific default model — overridden by `LLM_MODEL`. */
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

/** True when the chosen provider has a usable API key in env. */
export function hasLLMKey(): boolean {
  switch (activeProvider()) {
    case "openai":
      return !!envTrim("OPENAI_API_KEY");
    case "gemini":
      return !!envTrim("GEMINI_API_KEY") || !!envTrim("GOOGLE_API_KEY");
    case "anthropic":
      return !!envTrim("ANTHROPIC_API_KEY");
  }
}

/** Public chat entry point. Routes to the active provider. */
export async function chat<T>(opts: ChatOptions<T>): Promise<T> {
  const p = activeProvider();
  switch (p) {
    case "openai":
      return chatOpenAI(opts);
    case "gemini":
      return chatGemini(opts);
    case "anthropic":
      return chatAnthropic(opts);
  }
}

// ─────────────────────────────────────────────────────────────
// OpenAI
// ─────────────────────────────────────────────────────────────

async function chatOpenAI<T>(opts: ChatOptions<T>): Promise<T> {
  if (!_openai) {
    const apiKey = envTrim("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    _openai = new OpenAI({ apiKey });
  }

  // OpenAI accepts a zod schema natively via the helper.
  const completion = await _openai.chat.completions.parse({
    model: activeModel(),
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

async function chatGemini<T>(opts: ChatOptions<T>): Promise<T> {
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
    model: activeModel(),
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

async function chatAnthropic<T>(opts: ChatOptions<T>): Promise<T> {
  if (!_anthropic) {
    const apiKey = envTrim("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _anthropic = new Anthropic({ apiKey });
  }

  const schemaForOutput = zodToJSONSchemaForAnthropic(opts.schema);

  // The SDK exposes a `messages.parse` helper with `output_config` for
  // strict JSON-schema-enforced output. We narrow the type with `any`
  // for the output_config because the helper API is newer than the
  // declared types in some SDK builds.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = _anthropic as any;
  const message = await client.messages.parse({
    model: activeModel(),
    max_tokens: 1024,
    system: opts.system,
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
