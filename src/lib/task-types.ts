/** `blocked` waits on you, `open` waits on the company, `done` is filed. */
export type TaskState = "blocked" | "open" | "done";

/** A file uploaded as part of an answer; it lives in the company library. */
export interface TaskAttachment {
  id: string;
  title: string;
}

export interface PendingTask {
  id: string;
  title: string;
  /** What the agent could not get on its own. */
  need: string;
  /** What you replied when you unblocked it. */
  answer: string;
  /** Files you handed over with the answer, for the agent to read. */
  attachments: TaskAttachment[];
  /** Who got stuck, so resuming goes straight back to them. */
  agentId: string;
  author: string;
  area: string;
  state: TaskState;
  createdAt: string;
  updatedAt: string;
}
