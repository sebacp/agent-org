import type { FileFilter, FileMeta, FileRecord } from "@/lib/file-types";
import type { Thread } from "@/lib/run-types";
import type { PendingTask } from "@/lib/task-types";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok || !body) {
    throw new Error(body?.error ?? `El servidor respondió ${response.status}.`);
  }
  return body;
}

export async function fetchThreads(orgId: string): Promise<Thread[]> {
  const { threads } = await json<{ threads: Thread[] }>(
    `/api/threads?orgId=${encodeURIComponent(orgId)}`,
  );
  return threads;
}

export async function removeThread(orgId: string, id: string): Promise<void> {
  await json(
    `/api/threads?orgId=${encodeURIComponent(orgId)}&id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function fetchFiles(
  orgId: string,
  filter: FileFilter = {},
): Promise<FileMeta[]> {
  const params = new URLSearchParams({ orgId });
  if (filter.query) params.set("q", filter.query);
  if (filter.area) params.set("area", filter.area);
  if (filter.tag) params.set("tag", filter.tag);
  if (filter.author) params.set("author", filter.author);

  const { files } = await json<{ files: FileMeta[] }>(`/api/files?${params}`);
  return files;
}

export async function fetchFile(
  orgId: string,
  fileId: string,
): Promise<FileRecord> {
  const { file } = await json<{ file: FileRecord }>(
    `/api/files/${encodeURIComponent(fileId)}?orgId=${encodeURIComponent(orgId)}`,
  );
  return file;
}

export async function removeFile(orgId: string, fileId: string): Promise<void> {
  await json(
    `/api/files/${encodeURIComponent(fileId)}?orgId=${encodeURIComponent(orgId)}`,
    { method: "DELETE" },
  );
}

export async function fetchTasks(orgId: string): Promise<PendingTask[]> {
  const { tasks } = await json<{ tasks: PendingTask[] }>(
    `/api/tasks?orgId=${encodeURIComponent(orgId)}`,
  );
  return tasks;
}

export async function answerTask(
  orgId: string,
  id: string,
  answer: string,
): Promise<PendingTask> {
  const { task } = await json<{ task: PendingTask }>(
    `/api/tasks?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, answer }),
    },
  );
  return task;
}

export async function removeTask(orgId: string, id: string): Promise<void> {
  await json(
    `/api/tasks?orgId=${encodeURIComponent(orgId)}&id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

/** Called when a company is deleted, so its `.data` directory goes with it. */
export async function removeOrgFiles(orgId: string): Promise<void> {
  await json(`/api/files?orgId=${encodeURIComponent(orgId)}`, {
    method: "DELETE",
  });
}
