/**
 * A source that lists things answers with far more than fits in an agent's
 * context, and truncating it silently turns a dump into a sample nobody
 * declared. So the rows are put on disk one JSON object per line, and what the
 * agent gets back is the answer to a question about them — never the rows.
 */

export interface Extracted {
  records: Record<string, unknown>[];
  /** Stripe and most list APIs say so themselves; null means it didn't. */
  hasMore: boolean | null;
  /** The token some APIs hand back for the next page, if this one carried one. */
  nextCursor: string | null;
}

/** What a server calls the token it gives you for the next page. */
const CURSOR_FIELDS = [
  "next_cursor",
  "nextCursor",
  "next_page_token",
  "nextPageToken",
  "next_page",
  "nextPage",
  "next_offset",
  "cursor",
];

function cursorIn(object: Record<string, unknown>): string | null {
  for (const field of CURSOR_FIELDS) {
    const value = object[field];
    if (typeof value === "string" && value) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fromArray(value: unknown[]): Record<string, unknown>[] {
  return value.map((item) => asRecord(item) ?? { valor: item });
}

/**
 * What a list call actually returned. Servers wrap their rows differently —
 * a bare array, `{data: [...]}`, `{results: [...]}` — so the shape is found
 * rather than assumed, and a body that is already one-per-line is taken as is.
 */
export function extractRecords(text: string): Extracted | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return { records: fromArray(parsed), hasMore: null, nextCursor: null };
    }

    const object = asRecord(parsed);
    if (object) {
      const wrapped = Object.values(object).find((v) => Array.isArray(v));
      const hasMore =
        typeof object.has_more === "boolean" ? object.has_more : null;
      const nextCursor = cursorIn(object);
      return wrapped
        ? { records: fromArray(wrapped), hasMore, nextCursor }
        : { records: [object], hasMore, nextCursor };
    }
  } catch {
    // Not one JSON value. It may still be one per line.
  }

  const lines = trimmed.split("\n").filter((line) => line.trim());
  const records: Record<string, unknown>[] = [];
  for (const line of lines) {
    try {
      const record = asRecord(JSON.parse(line));
      if (!record) return null;
      records.push(record);
    } catch {
      return null;
    }
  }
  return records.length > 0
    ? { records, hasMore: null, nextCursor: null }
    : null;
}

export function toJsonl(records: Record<string, unknown>[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

export function parseJsonl(body: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = asRecord(JSON.parse(line));
      if (record) records.push(record);
    } catch {
      // One corrupt line is not a reason to lose the other eight thousand.
    }
  }
  return records;
}

/** Dotted paths, because half of what a source returns is nested. */
function pick(record: Record<string, unknown>, path: string): unknown {
  let current: unknown = record;
  for (const key of path.split(".")) {
    const step = asRecord(current);
    if (!step) return undefined;
    current = step[key];
  }
  return current;
}

export function fieldsOf(records: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  // Enough rows to catch a field that only some of them carry, few enough
  // that this stays instant on a dump of hundreds of thousands.
  for (const record of records.slice(0, 200)) {
    for (const key of Object.keys(record)) seen.add(key);
  }
  return [...seen];
}

/** ISO 4217 exponents that aren't 2, which is every one a payments API cares about. */
const NO_MINOR_UNIT = new Set(
  "bif clp djf gnf jpy kmf krw mga pyg rwf ugx vnd vuv xaf xof xpf".split(" "),
);
const THREE_DECIMALS = new Set("bhd iqd jod kwd lyd omr tnd".split(" "));

const MONEY_WORDS = new Set([
  "amount",
  "net",
  "fee",
  "total",
  "subtotal",
  "price",
  "cost",
  "revenue",
  "gross",
  "discount",
  "tax",
  "refunded",
  "balance",
]);

export interface MoneyUnit {
  /** The currencies actually present, lowercased. */
  currencies: string[];
  /** What the stored integers have to be divided by to become the real figure. */
  divisor: number;
}

/**
 * A payments API hands money as a whole count of the smallest unit — 900 is
 * nine dollars — and writes the currency next to it in every record. Summing
 * the column and reading the result as dollars is off by a hundred, which is
 * the kind of wrong that looks entirely plausible in a report: a company
 * turning over a thousand a week reads its own figure as a hundred thousand.
 *
 * Null whenever the guess isn't safe. A field is only money if its name says so
 * and every value of it is a whole number, so a timestamp or a quantity sitting
 * beside a currency is left alone.
 */
export function moneyUnit(
  records: Record<string, unknown>[],
  field: string,
): MoneyUnit | null {
  const leaf = field.split(".").pop() ?? "";
  if (!leaf.split("_").some((part) => MONEY_WORDS.has(part.toLowerCase()))) {
    return null;
  }

  const currencies = new Set<string>();
  let integers = 0;
  for (const record of records.slice(0, 200)) {
    const currency = record.currency;
    if (typeof currency !== "string" || !currency.trim()) return null;
    currencies.add(currency.trim().toLowerCase());
    const value = pick(record, field);
    if (value === undefined || value === null) continue;
    if (typeof value !== "number" || !Number.isInteger(value)) return null;
    integers += 1;
  }
  if (integers === 0) return null;

  const exponents = new Set(
    [...currencies].map((code) =>
      NO_MINOR_UNIT.has(code) ? 0 : THREE_DECIMALS.has(code) ? 3 : 2,
    ),
  );
  // Two currencies that divide differently have no shared divisor, and a sum
  // across currencies was never a figure to begin with.
  if (exponents.size !== 1) return null;
  const divisor = 10 ** [...exponents][0];
  return divisor === 1 ? null : { currencies: [...currencies], divisor };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Unix seconds, unix milliseconds or an ISO string, which is every way the
 * sources at hand write a date.
 */
function asDate(value: unknown): Date | null {
  const numeric = asNumber(value);
  if (numeric !== null) {
    const ms = numeric > 1e11 ? numeric : numeric * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export type Grouping = "valor" | "mes" | "dia" | "anio";

function bucket(value: unknown, how: Grouping): string {
  if (how === "valor") {
    if (value === undefined || value === null) return "(sin dato)";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  const date = asDate(value);
  if (!date) return "(sin fecha)";
  const iso = date.toISOString();
  return how === "anio"
    ? iso.slice(0, 4)
    : how === "mes"
      ? iso.slice(0, 7)
      : iso.slice(0, 10);
}

export type Op =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "contiene"
  | "existe"
  | "vacio";

export interface Filter {
  campo: string;
  op: Op;
  valor?: unknown;
}

function keep(record: Record<string, unknown>, filter: Filter): boolean {
  const actual = pick(record, filter.campo);
  const missing = actual === undefined || actual === null || actual === "";

  if (filter.op === "existe") return !missing;
  if (filter.op === "vacio") return missing;
  if (filter.op === "contiene") {
    return String(actual ?? "")
      .toLowerCase()
      .includes(String(filter.valor ?? "").toLowerCase());
  }

  // Numbers compare as numbers even when a source quotes them; anything else
  // falls back to the string, which is what makes `=` work on a status.
  const left = asNumber(actual);
  const right = asNumber(filter.valor);
  if (left !== null && right !== null) {
    switch (filter.op) {
      case "=":
        return left === right;
      case "!=":
        return left !== right;
      case ">":
        return left > right;
      case ">=":
        return left >= right;
      case "<":
        return left < right;
      case "<=":
        return left <= right;
    }
  }

  const a = String(actual ?? "");
  const b = String(filter.valor ?? "");
  switch (filter.op) {
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
  }
}

export type Metric = "contar" | "sumar" | "promedio" | "minimo" | "maximo";

export interface Query {
  filtros?: Filter[];
  agruparPor?: string;
  agruparComo?: Grouping;
  metrica?: Metric;
  campo?: string;
  limite?: number;
}

export interface QueryResult {
  matched: number;
  total: number;
  /** Rows that had no number where the metric needed one. */
  skipped: number;
  groups: { key: string; value: number; count: number }[];
}

export function queryDataset(
  records: Record<string, unknown>[],
  query: Query,
): QueryResult {
  const filters = query.filtros ?? [];
  const metric = query.metrica ?? "contar";
  const grouping = query.agruparComo ?? "valor";

  const totals = new Map<string, { sum: number; count: number; min: number; max: number }>();
  let matched = 0;
  let skipped = 0;

  for (const record of records) {
    if (!filters.every((filter) => keep(record, filter))) continue;
    matched += 1;

    const key = query.agruparPor
      ? bucket(pick(record, query.agruparPor), grouping)
      : "total";

    let entry = totals.get(key);
    if (!entry) {
      entry = { sum: 0, count: 0, min: Infinity, max: -Infinity };
      totals.set(key, entry);
    }
    entry.count += 1;

    if (metric === "contar") continue;
    const value = asNumber(pick(record, query.campo ?? ""));
    if (value === null) {
      skipped += 1;
      continue;
    }
    entry.sum += value;
    entry.min = Math.min(entry.min, value);
    entry.max = Math.max(entry.max, value);
  }

  const groups = [...totals].map(([key, e]) => ({
    key,
    count: e.count,
    value:
      metric === "contar"
        ? e.count
        : metric === "sumar"
          ? e.sum
          : metric === "promedio"
            ? e.count > 0
              ? e.sum / e.count
              : 0
            : metric === "minimo"
              ? Number.isFinite(e.min)
                ? e.min
                : 0
              : Number.isFinite(e.max)
                ? e.max
                : 0,
  }));

  // A grouping by month is read in order; anything else is read biggest first.
  groups.sort((a, b) =>
    grouping === "valor" ? b.value - a.value : a.key.localeCompare(b.key),
  );

  return {
    matched,
    total: records.length,
    skipped,
    groups: groups.slice(0, Math.min(Math.max(query.limite ?? 30, 1), 200)),
  };
}
