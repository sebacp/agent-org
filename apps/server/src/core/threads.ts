import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSafeId } from "@agent-org/shared/id";
import type { RunOrigin, Thread, Turn } from "@agent-org/shared/run-types";

import { ROOT } from "./paths";

function threadsPath(orgId: string): string {
  if (!isSafeId(orgId)) throw new Error("Id de empresa inválido.");
  return path.join(ROOT, orgId, "hilos.json");
}

/** A hilo saved before it could hold more than one exchange is that one turn. */
function readThread(raw: unknown): Thread {
  const stored = raw as Thread & Partial<Turn>;
  return {
    id: stored.id,
    title: stored.title,
    origin: stored.origin,
    createdAt: stored.createdAt,
    turns: stored.turns ?? [
      {
        task: stored.task ?? "",
        answer: stored.answer ?? "",
        steps: stored.steps ?? [],
        usage: stored.usage,
      },
    ],
  };
}

export async function listThreads(orgId: string): Promise<Thread[]> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(threadsPath(orgId), "utf8"),
    );
    return Array.isArray(parsed) ? parsed.map(readThread) : [];
  } catch {
    return [];
  }
}

/**
 * Files one more exchange under the hilo, opening it if this is the first. The
 * read-modify-write is why a corrida saves once at the end rather than as it
 * goes: two of them landing on the same hilo would otherwise lose a turn.
 */
export async function appendTurn(
  orgId: string,
  thread: { id: string; title: string; origin: RunOrigin },
  turn: Turn,
): Promise<Thread> {
  const existing = await listThreads(orgId);
  const previous = existing.find((t) => t.id === thread.id);
  const stored: Thread = {
    id: thread.id,
    title: (previous?.title ?? thread.title).slice(0, 120),
    origin: previous?.origin ?? thread.origin,
    turns: [...(previous?.turns ?? []), turn],
    createdAt: previous?.createdAt ?? new Date().toISOString(),
  };

  await mkdir(path.dirname(threadsPath(orgId)), { recursive: true });
  await writeFile(
    threadsPath(orgId),
    JSON.stringify(
      [stored, ...existing.filter((t) => t.id !== thread.id)],
      null,
      2,
    ),
    "utf8",
  );
  return stored;
}

export async function deleteThread(orgId: string, id: string): Promise<void> {
  const remaining = (await listThreads(orgId)).filter((t) => t.id !== id);
  await mkdir(path.dirname(threadsPath(orgId)), { recursive: true });
  await writeFile(
    threadsPath(orgId),
    JSON.stringify(remaining, null, 2),
    "utf8",
  );
}

export function newThreadId(): string {
  return randomUUID();
}

/** The first line of the task, which is what the sidebar shows. */
export function threadTitle(task: string): string {
  const line = task.trim().split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 57)}…` : line || "Sin título";
}
