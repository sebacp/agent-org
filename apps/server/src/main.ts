import path from "node:path";
import { createApp } from "./app";
import { REPO_ROOT, ROOT } from "./core/paths";
import { startScheduler } from "./core/scheduler";

// The keys live in one file at the root of the repo, next to the compose file,
// so a server install has a single thing to fill in. In a container they
// normally arrive as real environment variables and there is nothing to read.
for (const name of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(path.join(REPO_ROOT, name));
  } catch {
    // Not there, which is the usual case for one of the two.
  }
}

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

const server = createApp().listen(port, host, () => {
  console.log(`[api] escuchando en http://${host}:${port} · datos en ${ROOT}`);
  // Called once per server instance, which is where the automations wake up.
  startScheduler();
});

// A corrida is one request that stays open for as long as it runs, which is
// minutes: Node would otherwise cut it at its own five.
server.requestTimeout = 0;
server.headersTimeout = 0;

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    // Whatever is streaming has a few seconds to finish saying it.
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
