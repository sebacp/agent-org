import { modelThinks, type ModelId } from "@/lib/models";
import type { TokenUsage } from "@/lib/usage";
import type { ToolSchema } from "@/server/tools";

const ENDPOINT = "https://api.deepseek.com/chat/completions";

/**
 * Tool calls can chain; this stops a model that keeps searching forever. Real
 * work needs room: an API that makes you look up the operation before reading
 * it spends three rounds before the first number arrives.
 */
const MAX_TOOL_ROUNDS = 12;

/**
 * Withholding the tools on the last round isn't enough on its own: a model
 * mid-investigation writes the call it wanted to make as prose, and that ends
 * up as the answer. Being told the search is over is what closes it cleanly.
 */
const CLOSING =
  "Se te acabaron las consultas: no vas a poder usar más herramientas. Cerrá ahora con lo que ya juntaste, y si algo quedó sin confirmar decilo en una línea al final.";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

/** One SSE frame: a slice of the answer, of the reasoning, or of a tool call. */
interface StreamChunk {
  choices?: {
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
  usage?: RawUsage;
}

export class DeepSeekError extends Error {}

/** Older responses skip the cache split, so the miss count is derived. */
function readUsage(raw: RawUsage | undefined): TokenUsage {
  const cached = raw?.prompt_cache_hit_tokens ?? 0;
  return {
    cached,
    input:
      raw?.prompt_cache_miss_tokens ??
      Math.max((raw?.prompt_tokens ?? 0) - cached, 0),
    output: raw?.completion_tokens ?? 0,
  };
}

async function call(options: {
  apiKey: string;
  model: ModelId;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  onThinking?: (delta: string) => void;
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<{ content: string; toolCalls: ToolCall[]; usage: TokenUsage }> {
  const { apiKey, model, messages, tools, onThinking, onText, signal } = options;

  const response = await fetch(ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(tools?.length ? { tools } : {}),
      thinking: { type: modelThinks(model) ? "enabled" : "disabled" },
      stream: true,
      // Streaming drops the usage block unless it is asked for; it arrives in a
      // last frame of its own, after the answer is finished.
      stream_options: { include_usage: true },
    }),
  });

  if (!response.ok) {
    // The body can echo request fields, so only the status reaches the client.
    const detail = await response.text().catch(() => "");
    console.error(`DeepSeek ${response.status}: ${detail.slice(0, 500)}`);
    throw new DeepSeekError(
      response.status === 401 || response.status === 403
        ? "La API key de DeepSeek no es válida."
        : response.status === 402
          ? "La cuenta de DeepSeek no tiene saldo."
          : response.status === 429
            ? "DeepSeek está limitando el ritmo. Probá de nuevo en un momento."
            : `DeepSeek respondió ${response.status}.`,
    );
  }

  if (!response.body) throw new DeepSeekError("DeepSeek cortó la conexión.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage = readUsage(undefined);
  // A tool call arrives in slices across frames, and several can be open at
  // once; the index is the only thing tying the slices back together.
  const calls = new Map<number, ToolCall>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      const payload = line?.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      const chunk = JSON.parse(payload) as StreamChunk;
      if (chunk.usage) usage = readUsage(chunk.usage);

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.reasoning_content) onThinking?.(delta.reasoning_content);
      if (delta.content) {
        content += delta.content;
        onText?.(delta.content);
      }
      for (const part of delta.tool_calls ?? []) {
        const open = calls.get(part.index);
        calls.set(part.index, {
          id: part.id ?? open?.id ?? "",
          type: "function",
          function: {
            name: part.function?.name ?? open?.function.name ?? "",
            arguments:
              (open?.function.arguments ?? "") + (part.function?.arguments ?? ""),
          },
        });
      }
    }
  }

  return { content: content.trim(), toolCalls: [...calls.values()], usage };
}

/**
 * Runs the model to a final text answer, servicing any tool calls it makes
 * along the way. `onTool` both executes a call and reports it, so the caller
 * decides what a tool actually does. `onUsage` fires per round rather than at
 * the end, so tokens burned before a failure are still billed. `onThinking` and
 * `onText` see every round, including the ones whose text ends up discarded
 * because the model asked for a tool instead of answering.
 */
export async function chat(options: {
  apiKey: string;
  model: ModelId;
  system: string;
  user: string;
  tools?: ToolSchema[];
  onTool?: (call: ToolCall) => Promise<string>;
  onUsage?: (usage: TokenUsage) => void;
  onThinking?: (delta: string) => void;
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const {
    apiKey,
    model,
    system,
    user,
    tools,
    onTool,
    onUsage,
    onThinking,
    onText,
    signal,
  } = options;
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const last = round === MAX_TOOL_ROUNDS;
    if (onTool && last) messages.push({ role: "user", content: CLOSING });
    const { content, toolCalls, usage } = await call({
      apiKey,
      model,
      messages,
      tools: onTool && !last ? tools : undefined,
      onThinking,
      onText,
      signal,
    });
    onUsage?.(usage);

    if (!onTool || toolCalls.length === 0) {
      if (!content) throw new DeepSeekError("DeepSeek devolvió una respuesta vacía.");
      return content;
    }

    messages.push({ role: "assistant", content, tool_calls: toolCalls });
    for (const toolCall of toolCalls) {
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: await onTool(toolCall),
      });
    }
  }

  throw new DeepSeekError("El agente se quedó dando vueltas con las herramientas.");
}
