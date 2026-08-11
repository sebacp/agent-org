import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Two processes, one command. The API is its own server and the web app hands
 * `/api/...` over to it, so whoever installs this opens a single port and never
 * has to know there were ever two.
 *
 * Whichever one falls takes the other with it: a page that loads and cannot
 * answer anything looks like the app is up, and that is worse than being down.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The one port to open on a server. */
const PORT = process.env.PORT ?? "3100";

/**
 * Loopback only, and never published: the address the web app rewrites to is
 * resolved when it is built, so moving this needs `API_PROXY_URL` at build time
 * to say the same thing.
 */
const API_PORT = process.env.API_PORT ?? "4000";

const SHUTDOWN_MS = 8_000;

/**
 * In the image the web app is the standalone bundle Next traced, which carries
 * its own `node_modules`; in a checkout it is the same bundle still sitting in
 * `.next`. Both are `next build` output, so there is nothing to choose between
 * them beyond where they landed.
 */
const WEB = [
  path.join(ROOT, "web", "apps", "web", "server.js"),
  path.join(ROOT, "apps", "web", ".next", "standalone", "apps", "web", "server.js"),
].find(existsSync);

const API = path.join(ROOT, "apps", "server", "dist", "main.js");

if (!WEB || !existsSync(API)) {
  console.error("Falta el build. Corré `npm run build` antes de `npm start`.");
  process.exit(1);
}

let stopping = false;
let leaving = 0;
const children = [];

function start(name, entry, env) {
  const child = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  // Not `child.exitCode`: a process killed by a signal leaves that null for
  // good, and waiting on it would mean waiting for the timer every time.
  const one = { name, child, alive: true };
  children.push(one);
  child.on("exit", (code, signal) => {
    one.alive = false;
    if (stopping) {
      if (children.every((other) => !other.alive)) process.exit(leaving);
      return;
    }
    console.error(`[${name}] se cayó (${signal ?? code}); apago el resto.`);
    // Nobody asked it to stop, so it is a failure however it phrased it on the
    // way out — and whatever restarts this has to be told so.
    stop(code || 1);
  });
  return one;
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  leaving = code;
  const alive = children.filter((one) => one.alive);
  if (!alive.length) process.exit(code);
  for (const one of alive) one.child.kill("SIGTERM");
  // A corrida that is streaming gets a moment to finish saying it; past that
  // something is stuck and holding the port open helps nobody.
  setTimeout(() => {
    for (const one of children) if (one.alive) one.child.kill("SIGKILL");
    process.exit(code);
  }, SHUTDOWN_MS).unref();
}

// The API first: the web app is the only thing that talks to it, and it does so
// on request, so a second of overlap costs nothing either way.
start("api", API, { PORT: API_PORT, HOST: "127.0.0.1" });
// Not HOSTNAME, which is what the web app reads but also what Docker fills in
// with the container's own name: taking it meant binding that one address and
// refusing everything else, loopback included, so the container answered from
// outside while its own health check got the door shut on it.
start("web", WEB, { PORT, HOSTNAME: process.env.WEB_HOST ?? "0.0.0.0" });

console.log(`[start] abrí http://localhost:${PORT}`);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => stop(0));
}
