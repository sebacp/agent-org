import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSafeId, newId } from "@/lib/id";
import type { PendingTask, TaskState } from "@/lib/task-types";

const ROOT = path.join(process.cwd(), ".data");

function tasksPath(orgId: string): string {
  if (!isSafeId(orgId)) throw new Error("Id de empresa inválido.");
  return path.join(ROOT, orgId, "pendientes.json");
}

export async function listTasks(orgId: string): Promise<PendingTask[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(tasksPath(orgId), "utf8"));
    return Array.isArray(parsed) ? (parsed as PendingTask[]) : [];
  } catch {
    return [];
  }
}

async function write(orgId: string, tasks: PendingTask[]): Promise<void> {
  await mkdir(path.dirname(tasksPath(orgId)), { recursive: true });
  await writeFile(tasksPath(orgId), JSON.stringify(tasks, null, 2), "utf8");
}

export async function createTask(
  orgId: string,
  input: {
    title: string;
    need: string;
    agentId: string;
    author: string;
    area: string;
  },
): Promise<PendingTask> {
  const now = new Date().toISOString();
  const task: PendingTask = {
    id: newId("p"),
    title: input.title.trim().slice(0, 160) || "Sin título",
    need: input.need.trim().slice(0, 2000),
    answer: "",
    agentId: input.agentId,
    author: input.author,
    area: input.area,
    state: "blocked",
    createdAt: now,
    updatedAt: now,
  };
  await write(orgId, [task, ...(await listTasks(orgId))]);
  return task;
}

export async function updateTask(
  orgId: string,
  id: string,
  patch: { answer?: string; state?: TaskState },
): Promise<PendingTask | null> {
  const tasks = await listTasks(orgId);
  const found = tasks.find((t) => t.id === id);
  if (!found) return null;

  // Answering is what turns a task the company can't advance into one it can.
  const answered =
    patch.answer !== undefined ? patch.answer.slice(0, 4000) : found.answer;
  const updated: PendingTask = {
    ...found,
    answer: answered,
    state: patch.state ?? (answered.trim() ? "open" : found.state),
    updatedAt: new Date().toISOString(),
  };

  await write(
    orgId,
    tasks.map((t) => (t.id === id ? updated : t)),
  );
  return updated;
}

export async function deleteTask(orgId: string, id: string): Promise<void> {
  await write(
    orgId,
    (await listTasks(orgId)).filter((t) => t.id !== id),
  );
}
