import { MODELS, DEFAULT_MODEL, type ModelId } from "@/lib/models";

export interface TokenUsage {
  /** Prompt tokens that hit DeepSeek's cache; they bill at a tenth of the rest. */
  cached: number;
  input: number;
  output: number;
}

export interface RunUsage extends TokenUsage {
  /** USD, already priced with the model that produced the tokens. */
  cost: number;
}

export const NO_USAGE: RunUsage = { cached: 0, input: 0, output: 0, cost: 0 };

export function modelCost(id: ModelId, usage: TokenUsage): number {
  const price = (
    MODELS.find((m) => m.id === id) ??
    MODELS.find((m) => m.id === DEFAULT_MODEL)!
  ).price;
  return (
    (usage.cached * price.cached +
      usage.input * price.input +
      usage.output * price.output) /
    1_000_000
  );
}

export function addUsage(total: RunUsage, next: RunUsage): RunUsage {
  return {
    cached: total.cached + next.cached,
    input: total.input + next.input,
    output: total.output + next.output,
    cost: total.cost + next.cost,
  };
}

export function totalTokens(usage: TokenUsage): number {
  return usage.cached + usage.input + usage.output;
}

export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) {
    return `${(count / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })}k`;
  }
  return `${(count / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 2 })}M`;
}

/** Sub-cent runs are the normal case here, so the cheap ones keep their digits. */
export function formatCost(usd: number): string {
  const digits = usd > 0 && usd < 0.01 ? 4 : 2;
  return `US$ ${usd.toLocaleString("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}
