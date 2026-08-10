export interface Automation {
  id: string;
  name: string;
  /** Five fields, like crontab. The presets in the form write one of these. */
  cron: string;
  /** Taken from the browser, so "a las 9" means 9 where you are, not in UTC. */
  timezone: string;
  /** The same thing you would have typed in the chat. */
  task: string;
  /** Who it goes to. Empty starts at the CEO, like any other pedido. */
  agentId: string;
  enabled: boolean;
  /** Null when the cron has no future left, which crontab syntax allows. */
  nextRunAt: string | null;
  lastRunAt: string | null;
  /** The thread the last corrida left behind, so the card can open it. */
  lastThreadId: string | null;
  lastError: string | null;
  runs: number;
  /** What it has burned since it was created, in dollars. */
  cost: number;
  createdAt: string;
}

export interface AutomationDraft {
  name: string;
  cron: string;
  timezone: string;
  task: string;
  agentId: string;
  enabled: boolean;
}
