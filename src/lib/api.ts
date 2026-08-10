import type { Automation, AutomationDraft } from "@/lib/automation-types";
import type { FileFilter, FileMeta, FileRecord } from "@/lib/file-types";
import type { ActiveRun, OrgSnapshot, Thread } from "@/lib/run-types";
import type {
  SourceDraft,
  SourceProbe,
  SourceView,
} from "@/lib/source-types";
import type { PendingTask, TaskAttachment } from "@/lib/task-types";

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

/**
 * The org chart is edited here and stored here, so the server only gets a copy
 * — enough for an automation to run the company with no tab open.
 */
export async function mirrorOrg(
  orgId: string,
  snapshot: OrgSnapshot,
): Promise<void> {
  await json(`/api/org?orgId=${encodeURIComponent(orgId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
}

export async function fetchThreads(orgId: string): Promise<Thread[]> {
  const { threads } = await json<{ threads: Thread[] }>(
    `/api/threads?orgId=${encodeURIComponent(orgId)}`,
  );
  return threads;
}

/** What the company is doing right now, including with no tab of yours open. */
export async function fetchActiveRuns(orgId: string): Promise<ActiveRun[]> {
  const { runs } = await json<{ runs: ActiveRun[] }>(
    `/api/runs?orgId=${encodeURIComponent(orgId)}`,
  );
  return runs;
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

/** Where the bytes of a file that isn't text actually live. */
export function fileRawUrl(orgId: string, fileId: string): string {
  return `/api/files/${encodeURIComponent(fileId)}?orgId=${encodeURIComponent(
    orgId,
  )}&raw=1`;
}

export async function uploadFile(
  orgId: string,
  input: { title: string; content: string; area: string },
): Promise<FileMeta> {
  const { file } = await json<{ file: FileMeta }>(
    `/api/files?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
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
  attachments: TaskAttachment[],
): Promise<PendingTask> {
  const { task } = await json<{ task: PendingTask }>(
    `/api/tasks?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, answer, attachments }),
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

export async function fetchAutomations(orgId: string): Promise<Automation[]> {
  const { automations } = await json<{ automations: Automation[] }>(
    `/api/automations?orgId=${encodeURIComponent(orgId)}`,
  );
  return automations;
}

export async function createAutomation(
  orgId: string,
  draft: AutomationDraft,
): Promise<Automation> {
  const { automation } = await json<{ automation: Automation }>(
    `/api/automations?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    },
  );
  return automation;
}

export async function saveAutomation(
  orgId: string,
  id: string,
  patch: Partial<AutomationDraft>,
): Promise<Automation> {
  const { automation } = await json<{ automation: Automation }>(
    `/api/automations?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, id }),
    },
  );
  return automation;
}

/** Resolves when the whole corrida ends, which can take minutes. */
export async function runAutomationNow(
  orgId: string,
  id: string,
): Promise<void> {
  await json(
    `/api/automations?orgId=${encodeURIComponent(orgId)}&id=${encodeURIComponent(id)}&correr=1`,
    { method: "POST" },
  );
}

export async function removeAutomation(
  orgId: string,
  id: string,
): Promise<void> {
  await json(
    `/api/automations?orgId=${encodeURIComponent(orgId)}&id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function fetchSources(orgId: string): Promise<SourceView[]> {
  const { sources } = await json<{ sources: SourceView[] }>(
    `/api/sources?orgId=${encodeURIComponent(orgId)}`,
  );
  return sources;
}

/** Saving always reconnects, so the answer says whether the source works. */
export async function saveSource(
  orgId: string,
  input: SourceDraft,
): Promise<{ source: SourceView; probe: SourceProbe }> {
  return json<{ source: SourceView; probe: SourceProbe }>(
    `/api/sources?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function removeSource(orgId: string, id: string): Promise<void> {
  await json(
    `/api/sources?orgId=${encodeURIComponent(orgId)}&id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

/** Called when a company is deleted, so its `.data` directory goes with it. */
export async function removeOrgFiles(orgId: string): Promise<void> {
  await json(`/api/files?orgId=${encodeURIComponent(orgId)}`, {
    method: "DELETE",
  });
}
