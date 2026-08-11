import { execFile, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The company's own data goes in, and a script somebody else wrote runs on it.
 * That script is written by a model reading records that came from outside —
 * a field in a Stripe object can say whatever the person who typed it wanted —
 * so it is treated as hostile no matter how ordinary it looks.
 *
 * Four things it must not be able to do: reach the network, write anywhere,
 * read anything of yours, or outlive the question. The first three are the
 * kernel's job here; the last is a timer.
 */
const PROFILE = [
  "(version 1)",
  "(deny default)",
  // No socket, no DNS. Whatever it reads, it cannot send anywhere.
  "(deny network*)",
  "(allow process-exec*)",
  "(allow process-fork)",
  "(allow sysctl-read)",
  "(allow mach-lookup)",
  // The runtime's own files. The rule below takes it back for everything of
  // yours, which is where the keys, the source and the rest of the data are.
  "(allow file-read*)",
  '(deny file-read* (subpath "/Users") (subpath "/home") (subpath "/root"))',
  // Nothing is writable. The answer comes back on stdout and nowhere else.
  '(allow file-write-data (literal "/dev/null"))',
].join("");

/** Long enough for millions of records, short enough to not hang a corrida. */
const TIMEOUT_MS = 20_000;

/** What comes back is read by a model, so it is answers, not a log. */
const MAX_OUTPUT = 20_000;

/** A transformation can be much bigger than what it came from, but not endless. */
const MAX_EMITTED = 64 * 1024 * 1024;

/**
 * Reads the records off stdin so nothing on disk has to be reachable, and the
 * script off argv so no quoting of it can ever mean something to a shell.
 *
 * `guardar` goes out on its own descriptor rather than on stdout: a listing the
 * script produces is for the library, not for the model to read and retype. The
 * one time it had no such door it printed the records instead, hit the cap on
 * the output, and spent five calls cutting them into pieces.
 */
const BOOTSTRAP = `
import sys, os, json, base64, linecache, traceback
datos = json.load(sys.stdin)
registros = next(iter(datos.values())) if len(datos) == 1 else None
salida = os.fdopen(3, "w", encoding="utf-8")

def guardar(titulo, registros):
    titulo = str(titulo).strip()
    if not titulo:
        raise ValueError("guardar() necesita un título para el archivo")
    n = 0
    for registro in registros:
        salida.write(json.dumps([titulo, registro], ensure_ascii=False) + "\\n")
        n += 1
    return n

codigo = base64.b64decode(sys.argv[1]).decode("utf-8")
# So the traceback can quote the offending line back: nothing on disk holds it.
linecache.cache["script"] = (len(codigo), None, codigo.splitlines(True), "script")
try:
    exec(
        compile(codigo, "script", "exec"),
        {
            "datos": datos,
            "registros": registros,
            "guardar": guardar,
            "__name__": "__main__",
        },
    )
except SystemExit:
    pass
except BaseException as falla:
    # Only the frames of the script itself: whoever reads this wrote that, and
    # the lines above it are this file, which they cannot change anyway.
    suyos = [f for f in traceback.extract_tb(sys.exc_info()[2]) if f.filename == "script"]
    if suyos:
        sys.stderr.write("Traceback (most recent call last):\\n")
        sys.stderr.write("".join(traceback.format_list(suyos)))
    sys.stderr.write("".join(traceback.format_exception_only(type(falla), falla)))
    # Nothing is filed from a script that stopped: half a listing looks exactly
    # like a whole one once it is sitting in the library.
    sys.exit(1)
salida.flush()
`;

export interface SandboxResult {
  ok: boolean;
  output: string;
  /** What Python said when it stopped, ready to be handed back to fix. */
  error: string;
  /** Title to JSONL body, for every listing the script handed to `guardar`. */
  emitted: Record<string, string>;
  /** True when it wrote more than fits and what came through is a fragment. */
  overflowed: boolean;
  ms: number;
}

let python: Promise<string | null> | undefined;

async function findPython(): Promise<string | null> {
  // Only macOS gives a way to take the network and the filesystem away from a
  // process. Without one there is no safe way to run this, and the tool is
  // simply not offered — never run unpenned as a fallback.
  if (process.platform !== "darwin") return null;
  for (const candidate of [
    "python3",
    "/opt/homebrew/bin/python3",
    "/usr/bin/python3",
  ]) {
    try {
      const { stdout } = await run(candidate, [
        "-c",
        "import sys; print(sys.executable)",
      ]);
      const found = stdout.trim();
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
}

export function sandboxPython(): Promise<string | null> {
  return (python ??= findPython());
}

export async function sandboxReady(): Promise<boolean> {
  return (await sandboxPython()) !== null;
}

function cap(text: string): string {
  return text.length <= MAX_OUTPUT
    ? text
    : `${text.slice(0, MAX_OUTPUT)}\n[…corté acá: imprimiste ${text.length} caracteres. Imprimí el resultado, no los registros.]`;
}

/**
 * `datos` arrives as raw JSONL per file and is stitched into one JSON document
 * without being parsed on this side: node would spend a second building
 * objects it is about to throw away, and Python has to parse it regardless.
 */
function payload(datasets: Record<string, string>): string {
  const parts = Object.entries(datasets).map(([name, jsonl]) => {
    const rows = jsonl.split("\n").filter((line) => line.trim());
    return `${JSON.stringify(name)}:[${rows.join(",")}]`;
  });
  return `{${parts.join(",")}}`;
}

/**
 * Every emitted row arrives as `["título", registro]`, so which file it belongs
 * to travels with it and a script can fill more than one in a single pass
 * without either side keeping track of where it switched.
 */
function group(raw: Buffer): Record<string, string> {
  const files: Record<string, string[]> = {};
  for (const line of raw.toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const pair: unknown = JSON.parse(line);
      if (!Array.isArray(pair) || typeof pair[0] !== "string") continue;
      (files[pair[0]] ??= []).push(JSON.stringify(pair[1]));
    } catch {
      // The tail of a run that overflowed is half a line; the rest still stands.
    }
  }
  return Object.fromEntries(
    Object.entries(files).map(([title, lines]) => [
      title,
      `${lines.join("\n")}\n`,
    ]),
  );
}

export async function runPython(
  script: string,
  datasets: Record<string, string>,
): Promise<SandboxResult> {
  const binary = await sandboxPython();
  if (!binary) {
    return {
      ok: false,
      output: "",
      error: "no-sandbox",
      emitted: {},
      overflowed: false,
      ms: 0,
    };
  }

  const started = Date.now();
  return new Promise<SandboxResult>((resolve) => {
    const child = spawn(
      "/usr/bin/sandbox-exec",
      [
        "-p",
        PROFILE,
        binary,
        // Isolated: no PYTHONPATH, no user site-packages, no cwd on sys.path.
        "-I",
        "-c",
        BOOTSTRAP,
        Buffer.from(script, "utf8").toString("base64"),
      ],
      // Anywhere under a home directory is unreadable by the rules above, and
      // Python looks at where it was started before it runs anything. The
      // fourth pipe is where `guardar` writes, kept apart from stdout so a
      // listing of ten thousand rows never has to pass in front of the model.
      { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe", "pipe"] },
    );

    let out = "";
    let err = "";
    let cut = false;
    const rows: Buffer[] = [];
    let emittedBytes = 0;
    let overflowed = false;
    const done = (result: Omit<SandboxResult, "ms">) =>
      resolve({ ...result, ms: Date.now() - started });

    const timer = setTimeout(() => {
      cut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    timer.unref();

    // Reading past the cap only feeds a leak; the writer stops when nobody
    // is listening any more.
    child.stdout.on("data", (chunk: Buffer) => {
      if (out.length < MAX_OUTPUT * 2) out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (err.length < MAX_OUTPUT) err += chunk.toString("utf8");
    });
    const emitting = child.stdio[3];
    if (emitting && "on" in emitting) {
      emitting.on("data", (chunk: Buffer) => {
        if (emittedBytes >= MAX_EMITTED) {
          overflowed = true;
          return;
        }
        emittedBytes += chunk.byteLength;
        rows.push(chunk);
      });
    }

    child.on("error", (error) => {
      clearTimeout(timer);
      done({
        ok: false,
        output: "",
        error: error.message,
        emitted: {},
        overflowed: false,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (cut) {
        done({
          ok: false,
          output: cap(out),
          error: `El script tardó más de ${TIMEOUT_MS / 1000} segundos y lo corté. Probablemente estés recorriendo los registros de más: hacé una sola pasada.`,
          emitted: {},
          overflowed: false,
        });
        return;
      }
      const ok = code === 0;
      done({
        ok,
        output: cap(out),
        error: cap(err),
        emitted: ok ? group(Buffer.concat(rows)) : {},
        overflowed,
      });
    });

    child.stdin.on("error", () => {});
    child.stdin.end(payload(datasets));
  });
}
