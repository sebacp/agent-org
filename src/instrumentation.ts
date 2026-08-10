/** Called once per server instance, which is where the automations wake up. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("@/server/scheduler");
  startScheduler();
}
