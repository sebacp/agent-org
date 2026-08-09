import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSafeId } from "@/lib/id";
import type { Thread } from "@/lib/run-types";

const ROOT = path.join(process.cwd(), ".data");

function threadsPath(orgId: string): string {
  if (!isSafeId(orgId)) throw new Error("Id de empresa inválido.");
  return path.join(ROOT, orgId, "hilos.json");
}

export async function listThreads(orgId: string): Promise<Thread[]> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(threadsPath(orgId), "utf8"),
    );
    return Array.isArray(parsed) ? (parsed as Thread[]) : [];
  } catch {
    return [];
  }
}

export async function saveThread(
  orgId: string,
  thread: Omit<Thread, "createdAt"> & { createdAt?: string },
): Promise<Thread> {
  const existing = await listThreads(orgId);
  const previous = existing.find((t) => t.id === thread.id);
  const stored: Thread = {
    ...thread,
    title: thread.title.slice(0, 120),
    createdAt: previous?.createdAt ?? thread.createdAt ?? new Date().toISOString(),
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
