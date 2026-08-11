/** `price` is USD per million tokens; update it when DeepSeek moves its list. */
export const MODELS = [
  {
    id: "deepseek-v4-pro",
    label: "V4 Pro",
    hint: "Razona antes de responder",
    thinking: true,
    price: { cached: 0.07, input: 0.55, output: 1.68 },
  },
  {
    id: "deepseek-v4-flash",
    label: "V4 Flash",
    hint: "Rápido y barato",
    thinking: false,
    price: { cached: 0.028, input: 0.28, output: 0.42 },
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const DEFAULT_MODEL: ModelId = "deepseek-v4-flash";

export function modelLabel(id: ModelId): string {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}

export function modelThinks(id: ModelId): boolean {
  return MODELS.find((m) => m.id === id)?.thinking ?? false;
}

/**
 * Orgs saved before the catalog moved to DeepSeek carry model ids that no
 * longer resolve, so anything unrecognized falls back to the cheap default
 * instead of reaching the API and failing there.
 */
export function coerceModel(value: unknown): ModelId {
  return MODELS.some((m) => m.id === value)
    ? (value as ModelId)
    : DEFAULT_MODEL;
}
