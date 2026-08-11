import path from "node:path";

// Not `process.cwd()`: npm runs a workspace script from inside the workspace,
// so the company's data would land in `apps/server/.data` in dev and one
// directory up in production. It hangs off the package instead, which is the
// same place in both. `src/core` and `dist/core` sit at the same depth.
export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

/**
 * Everything the company owns lives under here: the org chart, the hilos, the
 * library and the sources. It is one directory so a server install can mount it
 * as a volume and keep the whole thing across deploys.
 */
export const ROOT = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(REPO_ROOT, ".data");
