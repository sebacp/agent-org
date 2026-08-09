import { modelThinks, type ModelId } from "@/lib/models";
import type { ToolSchema } from "@/server/tools";

const ENDPOINT = "https://api.deepseek.com/chat/completions";

/** Tool calls can chain; this stops a model that keeps searching forever. */
const MAX_TOOL_ROUNDS = 6;

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ChatResponse {
  choices?: {
    message?: { content?: string | null; tool_calls?: ToolCall[] };
  }[];
}

export class DeepSeekError extends Error {}

async function call(options: {
  apiKey: string;
  model: ModelId;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  signal?: AbortSignal;
}): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const { apiKey, model, messages, tools, signal } = options;

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
      stream: false,
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

  const message = ((await response.json()) as ChatResponse).choices?.[0]
    ?.message;
  return {
    content: message?.content?.trim() ?? "",
    toolCalls: message?.tool_calls ?? [],
  };
}

/**
 * Runs the model to a final text answer, servicing any tool calls it makes
 * along the way. `onTool` both executes a call and reports it, so the caller
 * decides what a tool actually does.
 */
export async function chat(options: {
  apiKey: string;
  model: ModelId;
  system: string;
  user: string;
  tools?: ToolSchema[];
  onTool?: (call: ToolCall) => Promise<string>;
  signal?: AbortSignal;
}): Promise<string> {
  const { apiKey, model, system, user, tools, onTool, signal } = options;
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    // On the last round the tools are withheld, which forces a text answer.
    const offerTools = onTool && round < MAX_TOOL_ROUNDS ? tools : undefined;
    const { content, toolCalls } = await call({
      apiKey,
      model,
      messages,
      tools: offerTools,
      signal,
    });

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
