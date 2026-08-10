import { fileSize, type FileMeta } from "@/lib/file-types";
import type { SourceRef } from "@/lib/run-types";
import type { AllowedSource } from "@/lib/source-types";
import type { LibraryPermission } from "@/lib/types";
import { fileLinkedAssets } from "@/server/assets";
import {
  extractRecords,
  fieldsOf,
  moneyUnit,
  parseJsonl,
  queryDataset,
  toJsonl,
  type Filter,
  type MoneyUnit,
  type Query,
} from "@/server/dataset";
import { asText, download } from "@/server/download";
import {
  appendDataset,
  closeDataset,
  deleteFile,
  findBySourceUrl,
  findByTitle,
  getFile,
  listFiles,
  readDataset,
  saveBinaryFile,
  saveFile,
} from "@/server/files";
import {
  callSourceTool,
  grantedToolSchemas,
  parseToolName,
  sourceToolArgs,
  type ToolArgs,
} from "@/server/mcp";
import { createTask, listTasks, updateTask } from "@/server/tasks";

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** What the UI shows in the trace: what was asked and how it went. */
export interface ToolOutcome {
  summary: string;
  content: string;
  fileId?: string;
  taskId?: string;
  /** Whose data this went out for, so the line can be shown under its logo. */
  source?: SourceRef;
}

const string = (description: string) => ({ type: "string", description });

export const TOOLS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "buscar_archivos",
      description:
        "Busca en la biblioteca de la empresa por texto. Devuelve los archivos cuyo título, etiquetas o contenido coinciden. Usalo antes de responder cualquier cosa que ya pueda estar escrita.",
      parameters: {
        type: "object",
        properties: {
          consulta: string("Palabras a buscar, en minúsculas."),
          limite: {
            type: "integer",
            description: "Cuántos resultados como máximo. Por defecto 10.",
          },
        },
        required: ["consulta"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_archivos",
      description:
        "Lista la biblioteca sin buscar por texto. Podés filtrar por área, etiqueta o autor para acotar.",
      parameters: {
        type: "object",
        properties: {
          area: string("Id del área, por ejemplo marketing o finance."),
          etiqueta: string("Una etiqueta exacta."),
          autor: string("Rol del agente que lo escribió, por ejemplo CFO."),
          limite: {
            type: "integer",
            description: "Cuántos resultados como máximo. Por defecto 20.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "leer_archivo",
      description:
        "Devuelve el contenido completo de un archivo. Usá el id que te dieron buscar_archivos o listar_archivos.",
      parameters: {
        type: "object",
        properties: { id: string("Id del archivo.") },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "guardar_archivo",
      description:
        "Guarda un documento en la biblioteca de la empresa para que el resto lo pueda leer después. Usalo cuando produzcas algo que valga la pena conservar: un plan, un análisis, un texto terminado. No lo uses para respuestas cortas.",
      parameters: {
        type: "object",
        properties: {
          titulo: string("Título corto y descriptivo."),
          contenido: string("El documento entero, en texto plano."),
          etiquetas: {
            type: "array",
            items: { type: "string" },
            description: "Dos o tres etiquetas en minúsculas.",
          },
        },
        required: ["titulo", "contenido"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "guardar_desde_link",
      description:
        "Descarga lo que haya detrás de un link y lo guarda en la biblioteca: una imagen que generó una fuente, un CSV, un PDF. Usalo siempre que una herramienta te devuelva una URL en vez del archivo, porque esos links se vencen y la biblioteca no. No lo uses para páginas web.",
      parameters: {
        type: "object",
        properties: {
          url: string("El link, tal cual te lo dieron."),
          titulo: string(
            "Título corto y descriptivo. Si no ponés ninguno uso el nombre del archivo.",
          ),
          etiquetas: {
            type: "array",
            items: { type: "string" },
            description: "Dos o tres etiquetas en minúsculas.",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "volcar_de_fuente",
      description:
        "Llama a una función de una fuente y guarda TODO lo que devuelve como registros en un archivo de datos, sin que te pase por delante. Recorro la paginación entera yo: no la hagas vos ni me llames de nuevo para pedir la página siguiente. Usalo en vez de llamar a la función directo cuando esperes muchos resultados (listados de cobros, suscripciones, filas de una tabla): así no se te trunca nada. Te devuelvo cuántos registros entraron y qué campos tienen. Después analizalo con consultar_archivo.",
      parameters: {
        type: "object",
        properties: {
          herramienta: string(
            "El nombre exacto de la función de la fuente, tal como figura en tu lista de herramientas.",
          ),
          argumentos: {
            type: "object",
            description:
              "Los argumentos de esa función: filtros, fechas, y cuántos registros por página si lo acepta. No pongas el cursor de la página siguiente, eso lo manejo yo.",
          },
          archivo: string(
            "Título del archivo de datos donde acumular. Si ya existe, le agrego los registros al final.",
          ),
          paginar_con: string(
            "Sólo si la función pagina con un argumento cuyo nombre no es de los habituales (starting_after, cursor, page, offset). Si va adentro de otro argumento, escribilo con puntos: parameters.starting_after. Normalmente no hace falta.",
          ),
        },
        required: ["herramienta", "archivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_archivo",
      description:
        "Contesta una pregunta sobre un archivo de datos sin leerlo: filtra, agrupa y calcula sobre todos los registros, y te devuelve sólo el resultado. Es la única forma de analizar un volcado grande. Llamalo sin metrica ni agrupar_por para ver primero cuántos registros hay, qué campos tienen y un ejemplo.",
      parameters: {
        type: "object",
        properties: {
          archivo: string("Título o id del archivo de datos."),
          filtros: {
            type: "array",
            description: "Condiciones que tiene que cumplir cada registro.",
            items: {
              type: "object",
              properties: {
                campo: string("Nombre del campo. Podés anidar con puntos."),
                op: {
                  type: "string",
                  enum: [
                    "=",
                    "!=",
                    ">",
                    ">=",
                    "<",
                    "<=",
                    "contiene",
                    "existe",
                    "vacio",
                  ],
                },
                valor: {
                  description: "Con qué comparar. No hace falta en existe/vacio.",
                },
              },
              required: ["campo", "op"],
            },
          },
          agrupar_por: string("Campo por el que abrir el resultado."),
          agrupar_como: {
            type: "string",
            enum: ["valor", "mes", "dia", "anio"],
            description:
              "Cómo agrupar. mes, dia o anio leen el campo como fecha, sea timestamp o ISO. Por defecto valor.",
          },
          metrica: {
            type: "string",
            enum: ["contar", "sumar", "promedio", "minimo", "maximo"],
            description: "Qué calcular en cada grupo. Por defecto contar.",
          },
          campo: string("Campo numérico sobre el que calcular, salvo contar."),
          limite: {
            type: "integer",
            description: "Cuántos grupos devolver. Por defecto 30.",
          },
        },
        required: ["archivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "borrar_archivo",
      description:
        "Borra un archivo de la biblioteca, para siempre y para todos. Usalo sólo para lo que quedó mal o duplicado, y nunca sobre algo que escribió otro sin estar seguro. Si dudás, dejalo y decilo en tu respuesta.",
      parameters: {
        type: "object",
        properties: { id: string("Id del archivo.") },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crear_pendiente",
      description:
        "Anota que el trabajo quedó trabado porque te falta algo que no está en la biblioteca: un dato, un acceso, una decisión. La persona a cargo lo ve y lo contesta, y la empresa retoma desde ahí. Usalo en lugar de escribir un documento pidiendo requerimientos.",
      parameters: {
        type: "object",
        properties: {
          titulo: string("Qué quedó sin hacer, en una línea."),
          falta: string(
            "Qué necesitás exactamente para poder seguir. Sé específico y pedí lo mínimo.",
          ),
        },
        required: ["titulo", "falta"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_pendientes",
      description:
        "Muestra los pendientes de la empresa con su estado y, si ya te contestaron, la respuesta. Miralo antes de empezar: puede que lo que te falta ya esté ahí.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "cerrar_pendiente",
      description:
        "Marca un pendiente como resuelto. Usalo cuando terminaste el trabajo que estaba trabado.",
      parameters: {
        type: "object",
        properties: { id: string("Id del pendiente.") },
        required: ["id"],
      },
    },
  },
];

/** The library functions that only exist for an agent who was granted them. */
const LIBRARY_GATED: Record<string, LibraryPermission> = {
  guardar_archivo: "write",
  guardar_desde_link: "write",
  volcar_de_fuente: "write",
  borrar_archivo: "delete",
};

/**
 * The built-in functions this agent may use plus the source ones it was
 * granted. A source that won't answer is left out rather than failing the run,
 * since the agent can still work from the library.
 */
export async function toolsFor(
  orgId: string,
  sources: AllowedSource[],
  library: LibraryPermission[],
): Promise<ToolSchema[]> {
  const remote = await Promise.all(
    sources.map((source) =>
      grantedToolSchemas(orgId, source).catch((error: unknown) => {
        console.error(`Fuente ${source.id} no respondió:`, error);
        return [];
      }),
    ),
  );
  const own = TOOLS.filter((tool) => {
    const needs = LIBRARY_GATED[tool.function.name];
    return !needs || library.includes(needs);
  });
  return [...own, ...remote.flat()];
}

/** A whole export would not fit in the model's context, so a read gets the head. */
const MAX_READ_CHARS = 80_000;

/** What a source may put in front of a model before it stops being readable. */
const MAX_ANSWER_CHARS = 40_000;

/**
 * Cutting a listing in half leaves a model holding a sample it believes is
 * everything, and it will report totals off it. So the cut says what was lost
 * and names the one way to get the rest.
 */
function trimAnswer(text: string, tool: string): string {
  if (text.length <= MAX_ANSWER_CHARS) return text;
  return [
    text.slice(0, MAX_ANSWER_CHARS),
    `[Corté acá: la respuesta entera tiene ${text.length} caracteres y esto es apenas el principio. NO saques totales ni conclusiones de esta parte. Para tenerla completa volvé a pedirla con volcar_de_fuente (herramienta: "${tool}", los mismos argumentos), que la guarda entera sin pasártela, y después analizala con consultar_archivo.]`,
  ].join("\n\n");
}

const STATE_LABEL: Record<string, string> = {
  blocked: "esperando respuesta",
  open: "listo para retomar",
  done: "resuelto",
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asLimit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(Math.trunc(value), 1), 50)
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecordArg(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function renderList(files: FileMeta[]): string {
  if (files.length === 0) return "No hay archivos que coincidan.";
  return files
    .map((f) =>
      [f.id, f.title, `por ${f.author}`, f.mime, fileSize(f)]
        .filter(Boolean)
        .join(" · "),
    )
    .join("\n");
}

/**
 * A model naming a source function tends to write it as it reads it in its own
 * list, but not always: sometimes it drops the prefix and gives the bare name.
 * Both are unambiguous as long as one source has it.
 */
function findGranted(
  sources: AllowedSource[],
  named: string,
): { source: AllowedSource; tool: string } | null {
  const parsed = parseToolName(named);
  if (parsed) {
    const source = sources.find((s) => s.id === parsed.sourceId);
    return source?.allowed.includes(parsed.tool)
      ? { source, tool: parsed.tool }
      : null;
  }
  const source = sources.find((s) => s.allowed.includes(named));
  return source ? { source, tool: named } : null;
}

/** The last id in a page is the cursor every list API wants for the next one. */
function lastId(records: Record<string, unknown>[]): string | null {
  const id = records.at(-1)?.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

/** What a list function tends to call the argument that carries its cursor. */
const CURSOR_ARGS = [
  "starting_after",
  "start_cursor",
  "cursor",
  "next_cursor",
  "after",
  "page_token",
  "pageToken",
  "page",
  "offset",
  "skip",
];

/** The ones that count instead of pointing, and so advance by arithmetic. */
const COUNTING_ARGS = new Set(["page", "offset", "skip"]);

/**
 * Where the cursor goes: an argument of the function, or a key inside one of
 * its arguments. Written down dotted so a dump picked up days later puts it
 * back where it found it.
 */
type CursorPath = string[];

function readAt(args: Record<string, unknown>, path: CursorPath): unknown {
  let current: unknown = args;
  for (const step of path) {
    if (!isRecord(current)) return undefined;
    current = current[step];
  }
  return current;
}

/** Copies down the way, so a nested bag the caller still holds is untouched. */
function writeAt(
  args: Record<string, unknown>,
  path: CursorPath,
  value: string | null,
): void {
  const [head, ...rest] = path;
  if (!head) return;
  if (rest.length === 0) {
    if (value === null) delete args[head];
    else args[head] = value;
    return;
  }
  const bag = isRecord(args[head]) ? { ...args[head] } : {};
  writeAt(bag, rest, value);
  args[head] = bag;
}

/**
 * Only the server knows what it named its cursor, so the name is taken from
 * what the agent already passed, and failing that from the function's own
 * schema. Nothing is invented: a function with no cursor gets one page. `bag`
 * is where a name still to be guessed would go — the passthrough argument when
 * there is one, since a function like that declares no cursor of its own and
 * one written beside it is an argument the server has never heard of.
 */
async function cursorPath(
  orgId: string,
  source: AllowedSource,
  tool: string,
  args: Record<string, unknown>,
  override: string,
): Promise<{ path: CursorPath | null; bag: string | null }> {
  if (override) return { path: override.split("."), bag: null };

  const given = CURSOR_ARGS.find((name) => name in args);
  if (given) return { path: [given], bag: null };
  for (const [key, value] of Object.entries(args)) {
    if (!isRecord(value)) continue;
    const nested = CURSOR_ARGS.find((name) => name in value);
    if (nested) return { path: [key, nested], bag: key };
  }

  const { names, bags } = await sourceToolArgs(orgId, source, tool).catch(
    (): ToolArgs => ({ names: [], bags: [] }),
  );
  const declared = CURSOR_ARGS.find((name) => names.includes(name));
  if (declared) return { path: [declared], bag: null };
  return { path: null, bag: bags.find((name) => isRecord(args[name])) ?? null };
}

/** A run's worth of pages: past this, something is looping or is too big. */
const MAX_DUMP_PAGES = 200;
const MAX_DUMP_RECORDS = 200_000;
/** Nobody waits longer than this for one tool call to come back. */
const MAX_DUMP_MS = 3 * 60_000;

/**
 * The whole listing, however many pages that is. Walking the pagination here
 * rather than handing it back to the model is the difference between a dump
 * that finishes and one that runs out of turns halfway through: every page
 * used to cost a round of the conversation, and a listing of any real size
 * exhausted them before it ended.
 */
async function dumpFromSource(
  orgId: string,
  agent: { role: string; department: string },
  sources: AllowedSource[],
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const named = asString(args.herramienta).trim();
  const found = findGranted(sources, named);
  if (!found) {
    return {
      summary: `no encontró la función ${named || "(sin nombre)"}`,
      content:
        "No tenés esa función. Usá el nombre exacto de una de las que figuran en tu lista de herramientas.",
    };
  }

  const title = asString(args.archivo).trim();
  if (!title) {
    return {
      summary: "no dijo dónde volcarlo",
      content: "No volqué nada: falta el título del archivo donde acumular.",
    };
  }

  const ref: SourceRef = {
    label: found.source.label || "la fuente",
    url: found.source.url,
  };

  const existing = await findByTitle(orgId, title);
  if (existing && existing.records === undefined) {
    return {
      summary: `"${title}" ya existe y no es un volcado`,
      content: `Ya hay un archivo llamado "${title}" que no es de datos. Usá otro título.`,
      source: ref,
    };
  }
  // Walking the same listing into the same file again would file every record
  // a second time, and the totals would come out double without looking wrong.
  if (existing && !existing.cursor) {
    return {
      summary: `"${title}" ya está completo`,
      content: `"${existing.title}" ya tiene ${(existing.records ?? 0).toLocaleString("es-AR")} registros y el volcado terminó: si lo vuelvo a hacer, queda todo cargado dos veces. Preguntale lo que necesites con consultar_archivo, o usá otro título si esto es un listado distinto.`,
      fileId: existing.id,
      source: ref,
    };
  }

  const callArgs = { ...asRecordArg(args.argumentos) };
  const { path, bag } = await cursorPath(
    orgId,
    found.source,
    found.tool,
    callArgs,
    asString(args.paginar_con).trim(),
  );
  // A dump picked up later goes back to whatever worked the first time.
  const declared = existing?.cursorArg ? existing.cursorArg.split(".") : path;
  let cursor: CursorPath | null = declared;
  /**
   * The conventional names left to try when the function's schema never said
   * how to ask for the next page. Guessing only starts once a page says there
   * is more behind it, and a wrong guess comes back as a page already written,
   * which is caught before anything is filed — so it costs a call, never a
   * duplicate. Without this, a server that paginates without declaring it
   * yields one page that looks like the whole listing.
   */
  const guesses = declared ? [] : [...CURSOR_ARGS];
  // Picking up a dump that ran into a limit last time.
  if (existing?.cursor && cursor) writeAt(callArgs, cursor, existing.cursor);

  let meta: FileMeta | null = existing ?? null;
  /** Written to the body but not yet to the index, which catches up at the end. */
  let addedRecords = 0;
  let addedChars = 0;
  let pages = 0;
  let fields: string[] = [];
  /**
   * The first id of every page already written. A cursor that loops back to
   * any of them — a stuck one, or an argument the server quietly ignored — is
   * caught before its rows are filed a second time.
   */
  const seen = new Set<string>();
  /** Whether the page just written said there was another one behind it. */
  let moreAhead = false;
  /** Why it ended, in the agent's words. */
  let stop = "";
  /** Whether it ended because the listing did, rather than because of this. */
  let complete = false;
  /** Where to pick up if this stops early; empty means there is nowhere. */
  let pending: string | null = null;
  const started = Date.now();

  /**
   * Swaps in the next conventional cursor name and asks for the same page
   * over again. Nothing the previous name produced was written, so there is
   * nothing to undo.
   */
  const tryNextName = (): boolean => {
    const next = guesses.shift();
    if (!next || pending === null) return false;
    if (cursor) writeAt(callArgs, cursor, null);
    cursor = bag ? [bag, next] : [next];
    writeAt(callArgs, cursor, pending);
    return true;
  };

  while (pages < MAX_DUMP_PAGES) {
    let answer: string;
    try {
      answer = await callSourceTool(orgId, found.source, found.tool, callArgs);
    } catch (error) {
      // A server refusing an argument it never declared is the guess being
      // wrong, not the listing ending.
      if (tryNextName()) continue;
      stop = `La fuente cortó en la página ${pages + 1}: ${
        error instanceof Error ? error.message : "error desconocido"
      }.`;
      break;
    }

    const extracted = extractRecords(answer);
    const records = extracted?.records ?? [];
    if (records.length === 0) {
      // Nothing at all on the first call means whatever came back isn't rows,
      // and it is small enough to just read.
      if (pages === 0) {
        return {
          summary: `volcó ${found.tool} · sin registros`,
          content: `Esa llamada no devolvió registros que pueda volcar. Esto es lo que contestó:\n\n${trimAnswer(answer, found.tool)}`,
          source: ref,
        };
      }
      // An empty page is how a listing without a has_more ends — unless the
      // page before it said otherwise, and then something ate the rest.
      if (moreAhead) {
        stop =
          "La fuente había dicho que quedaban más registros y la página siguiente vino vacía.";
      } else complete = true;
      pending = null;
      break;
    }

    const head = lastId(records.slice(0, 1));
    if (head !== null && seen.has(head)) {
      if (tryNextName()) continue;
      stop = `La paginación dejó de avanzar en la página ${pages + 1}: volvió a devolver registros que ya tenía.`;
      pending = null;
      break;
    }
    if (head !== null) seen.add(head);

    if (fields.length === 0) fields = fieldsOf(records);
    const body = toJsonl(records);

    if (meta) {
      await appendDataset(orgId, meta.id, body);
      addedRecords += records.length;
      addedChars += body.length;
    } else {
      // The first page creates the file, so the index already counts it.
      meta = await saveFile(orgId, {
        title,
        content: body,
        author: agent.role,
        area: agent.department,
        tags: ["datos", found.tool],
        records: records.length,
      });
    }

    pages += 1;
    moreAhead = extracted?.hasMore === true;
    // A cursor that brought back a page nobody had seen is the right one, and
    // the names still on the list would only bring back pages already written.
    if (cursor) guesses.length = 0;

    // The one ending a server states outright.
    if (extracted?.hasMore === false) {
      complete = true;
      pending = null;
      break;
    }

    // Where the next page would come from, worked out before deciding whether
    // to go get it: stopping at a limit has to leave somewhere to resume.
    const leaf = cursor?.at(-1) ?? "";
    if (COUNTING_ARGS.has(leaf)) {
      const base = Number(readAt(callArgs, cursor!) ?? (leaf === "page" ? 1 : 0));
      pending = String(leaf === "page" ? base + 1 : base + records.length);
    } else {
      pending = extracted?.nextCursor ?? lastId(records);
    }
    if (pending === null) {
      stop =
        "La fuente no devolvió un cursor ni ids con los que pedirle la página siguiente.";
      break;
    }

    if (!cursor && !tryNextName()) {
      // Nothing left to try. Whether that is the end depends on whether the
      // page just written claimed anything was behind it.
      stop = moreAhead
        ? "La fuente dice que hay más registros y no encontré con qué pedirle la página siguiente. Volvé a llamarme pasando paginar_con si sabés cómo se llama ese argumento, o acotá el pedido con filtros hasta que entre de una."
        : "Esa función no pagina (no encontré con qué pedirle la página siguiente), así que esto es todo lo que devuelve de una.";
      complete = !moreAhead;
      break;
    }
    if (cursor) writeAt(callArgs, cursor, pending);

    if ((meta?.records ?? 0) + addedRecords >= MAX_DUMP_RECORDS) {
      stop = `Corté en ${MAX_DUMP_RECORDS.toLocaleString("es-AR")} registros, que es mi tope. Volvé a llamarme con el mismo archivo para seguir desde donde quedó, o acotá el pedido (un rango de fechas más corto, un filtro).`;
      break;
    }
    if (Date.now() - started > MAX_DUMP_MS) {
      stop = `Corté por tiempo después de ${pages} páginas. Volvé a llamarme con el mismo archivo para seguir desde donde quedó.`;
      break;
    }
  }
  if (pages === MAX_DUMP_PAGES && !stop) {
    stop = `Corté en ${MAX_DUMP_PAGES} páginas, que es mi tope. Volvé a llamarme con el mismo archivo para seguir desde donde quedó, o pedí más registros por página.`;
  }

  if (!meta) {
    return {
      summary: "no pudo volcar",
      content: "No pude escribir en ese archivo. Probá con otro título.",
      source: ref,
    };
  }
  // Whatever landed on disk gets counted, including when the loop fell over.
  // A dump that stopped short says so on the file itself: from here on it is
  // the file that carries the warning, because whoever asks it for a total
  // months from now won't have read this.
  meta =
    (await closeDataset(orgId, meta.id, {
      chars: addedChars,
      records: addedRecords,
      cursor: pending,
      cursorArg: cursor?.join(".") ?? null,
      partial: complete ? "" : stop,
    })) ?? meta;

  const total = meta.records ?? 0;
  return {
    summary: `volcó ${total.toLocaleString("es-AR")} registros${
      meta.partial ? " · incompleto" : ""
    } · "${meta.title}"`,
    // Counts and field names: the rows themselves are the whole point of not
    // returning them, and a model given a sample starts reporting off it.
    content: [
      `"${meta.title}" quedó con ${total.toLocaleString("es-AR")} registros (${pages} ${pages === 1 ? "página" : "páginas"} de ${ref.label}).`,
      `Campos: ${fields.join(", ")}.`,
      meta.partial
        ? `OJO: el volcado quedó incompleto. ${meta.partial} Cualquier cifra que saques de este archivo va a estar corta: no la des como total sin decir que falta gente adentro.`
        : stop || "Recorrí la paginación hasta el final: el volcado está completo.",
      "No leas este archivo: analizalo con consultar_archivo.",
    ].join("\n"),
    fileId: meta.id,
    source: ref,
  };
}

function asFilters(value: unknown): Filter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const raw = item as Partial<Filter> | null;
    if (!raw || typeof raw.campo !== "string" || typeof raw.op !== "string") {
      return [];
    }
    return [{ campo: raw.campo, op: raw.op as Filter["op"], valor: raw.valor }];
  });
}

function renderGroups(
  result: ReturnType<typeof queryDataset>,
  query: Query,
  /** Set when the column being added up is money stored in its smallest unit. */
  money: MoneyUnit | null,
): string {
  const metric = query.metrica ?? "contar";
  const unit = money ? ` (${money.currencies.join("/").toUpperCase()})` : "";
  const head = query.agruparPor
    ? `| ${query.agruparPor} | ${metric}${unit} | registros |\n| --- | ---: | ---: |`
    : `| ${metric}${unit} | registros |\n| ---: | ---: |`;

  const rows = result.groups.map((g) => {
    // Converted here and never shown raw: a figure printed twice is a figure
    // the reader gets to pick from, and this is the one they picked wrong.
    const scaled = money ? g.value / money.divisor : g.value;
    const value =
      money || !Number.isInteger(scaled)
        ? scaled.toFixed(money ? Math.log10(money.divisor) : 2)
        : scaled;
    return query.agruparPor
      ? `| ${g.key} | ${value} | ${g.count} |`
      : `| ${value} | ${g.count} |`;
  });

  return [head, ...rows].join("\n");
}

/**
 * A sum over a dump that stopped short comes back looking exactly like a total,
 * and nothing downstream can tell the difference — so the warning rides on
 * every answer the file gives, not just on the call that filled it.
 */
function shortWarning(meta: FileMeta): string {
  return meta.partial
    ? `OJO: "${meta.title}" está incompleto. ${meta.partial} Lo de abajo sale sólo de los ${(meta.records ?? 0).toLocaleString("es-AR")} registros que alcancé a guardar: no es un total. Si lo vas a informar, decí que falta, o completá el volcado antes.`
    : "";
}

async function queryFile(
  orgId: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const wanted = asString(args.archivo).trim();
  const meta =
    (await findByTitle(orgId, wanted)) ??
    (await listFiles(orgId, { limit: 200 })).find((m) => m.id === wanted) ??
    null;

  if (!meta) {
    return {
      summary: `no encontró "${wanted}"`,
      content: "No hay ningún archivo con ese título o id.",
    };
  }
  if (meta.records === undefined) {
    return {
      summary: `"${meta.title}" no es un volcado`,
      content: `"${meta.title}" es un documento, no un archivo de datos. Leelo con leer_archivo.`,
    };
  }

  const records = parseJsonl(await readDataset(orgId, meta.id));

  // Nothing asked yet: what this is and what can be asked of it.
  if (!args.metrica && !args.agrupar_por) {
    const sample = records[0];
    const fields = fieldsOf(records);
    // The sample below shows `"amount":900` beside `"currency":"usd"`, and that
    // has already been read as nine hundred dollars once.
    const monetary = fields.filter((field) => moneyUnit(records, field));
    return {
      summary: `miró "${meta.title}" · ${records.length} registros${
        meta.partial ? " · incompleto" : ""
      }`,
      content: [
        shortWarning(meta),
        `"${meta.title}" tiene ${records.length} registros.`,
        `Campos: ${fields.join(", ")}.`,
        monetary.length > 0
          ? `Ojo con ${monetary.join(", ")}: acá abajo los vas a ver en la unidad mínima de la moneda, que es como los guarda la fuente. No los leas como si fueran la cifra final. Cuando pidas una métrica sobre ellos te los devuelvo ya convertidos.`
          : "",
        sample
          ? `Un registro de ejemplo:\n${JSON.stringify(sample, null, 2).slice(0, 4_000)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      fileId: meta.id,
    };
  }

  const query: Query = {
    filtros: asFilters(args.filtros),
    agruparPor: asString(args.agrupar_por) || undefined,
    agruparComo: (asString(args.agrupar_como) || "valor") as Query["agruparComo"],
    metrica: (asString(args.metrica) || "contar") as Query["metrica"],
    campo: asString(args.campo) || undefined,
    limite: typeof args.limite === "number" ? args.limite : undefined,
  };

  const result = queryDataset(records, query);
  const shown = result.groups.length;
  const money =
    query.metrica && query.metrica !== "contar"
      ? moneyUnit(records, query.campo ?? "")
      : null;

  return {
    summary: `consultó "${meta.title}" · ${result.matched} de ${result.total}${
      meta.partial ? " · incompleto" : ""
    }`,
    content: [
      shortWarning(meta),
      `Sobre "${meta.title}": ${result.matched} de ${result.total} registros pasaron el filtro.`,
      money
        ? `"${query.campo}" viene guardado en la unidad mínima de la moneda, que es como lo devuelve la fuente. Ya lo convertí: la tabla está en ${money.currencies.join(" y ").toUpperCase()} y esos números se informan tal cual. No los vuelvas a dividir ni a multiplicar.`
        : "",
      renderGroups(result, query, money),
      result.skipped > 0
        ? `[${result.skipped} registros no tenían un número en "${query.campo ?? ""}" y quedaron fuera del cálculo.]`
        : "",
      query.agruparPor && shown === (query.limite ?? 30)
        ? `[Te devolví ${shown} grupos, que es el límite. Puede haber más.]`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    fileId: meta.id,
  };
}

/**
 * Tool failures come back as readable text rather than thrown errors: a model
 * that gets told what went wrong can retry, whereas an aborted run can't.
 */
export async function runTool(
  orgId: string,
  name: string,
  rawArgs: string,
  agent: { id: string; role: string; department: string },
  sources: AllowedSource[],
  library: LibraryPermission[],
  /** What this agent is working on, kept on anything it leaves behind. */
  assignment: string,
): Promise<ToolOutcome> {
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(rawArgs || "{}");
    if (parsed && typeof parsed === "object") {
      args = parsed as Record<string, unknown>;
    }
  } catch {
    return {
      summary: "argumentos ilegibles",
      content: "No pude leer los argumentos. Mandá JSON válido.",
    };
  }

  const remote = parseToolName(name);
  if (remote) {
    const source = sources.find((s) => s.id === remote.sourceId);
    // The model can name any function it likes, so the grant is checked here
    // and not only when the catalog is built.
    if (!source || !source.allowed.includes(remote.tool)) {
      // Saying only "no" sends the model looking for a way around it, and the
      // way around a missing account id is to invent one. Whether the function
      // exists at all is the difference between a pendiente somebody can act on
      // and another guess.
      const where = source ? source.label || "la fuente" : "";
      return {
        summary: `pidió una función que no tiene (${remote.tool})`,
        content: [
          source?.tools.some((t) => t.name === remote.tool)
            ? `${remote.tool} existe en ${where} pero no te la habilitaron.`
            : "No tenés acceso a esa función.",
          source ? `Las tuyas en ${where} son: ${source.allowed.join(", ")}.` : "",
          "No busques otra manera de hacer lo mismo ni inventes datos que esa función te iba a dar: si te hace falta, dejalo con crear_pendiente diciendo qué función pedís y para qué.",
        ]
          .filter(Boolean)
          .join(" "),
      };
    }
    const label = source.label || "la fuente";
    // The name is on the line as a chip instead of in the sentence, so the
    // summaries below say what happened and leave the whose to it.
    const ref: SourceRef = { label, url: source.url };
    try {
      const whole = await callSourceTool(orgId, source, remote.tool, args);
      const { text, saved } = await fileLinkedAssets(
        orgId,
        { role: agent.role, department: agent.department, label },
        trimAnswer(whole, remote.tool),
      );
      const kept = saved[0];
      return {
        summary: kept
          ? `consultó ${remote.tool} · guardó "${kept.title}"`
          : `consultó ${remote.tool}`,
        content: text,
        source: ref,
        ...(kept ? { fileId: kept.id } : {}),
      };
    } catch (error) {
      return {
        summary: `falló · ${remote.tool}`,
        content: `La fuente no respondió: ${
          error instanceof Error ? error.message : "error desconocido"
        }. Seguí con lo que tengas o dejá un pendiente.`,
        source: ref,
      };
    }
  }

  // Same as with a source: the catalog already left this out, but a model is
  // free to name anything, so the permission is checked where it acts.
  const needs = LIBRARY_GATED[name];
  if (needs && !library.includes(needs)) {
    return {
      summary: `quiso ${needs === "delete" ? "borrar" : "guardar"} sin permiso`,
      content:
        needs === "delete"
          ? "No podés borrar archivos. Si hay que sacar uno, dejá un pendiente."
          : "No podés guardar en la biblioteca. Devolvé el trabajo en tu respuesta.",
    };
  }

  switch (name) {
    case "buscar_archivos": {
      const consulta = asString(args.consulta);
      const files = await listFiles(orgId, {
        query: consulta,
        limit: asLimit(args.limite, 10),
      });
      return {
        summary: `buscó "${consulta}" · ${files.length} resultado${files.length === 1 ? "" : "s"}`,
        content: renderList(files),
      };
    }

    case "listar_archivos": {
      const files = await listFiles(orgId, {
        area: asString(args.area) || undefined,
        tag: asString(args.etiqueta) || undefined,
        author: asString(args.autor) || undefined,
        limit: asLimit(args.limite, 20),
      });
      return {
        summary: `listó la biblioteca · ${files.length} archivo${files.length === 1 ? "" : "s"}`,
        content: renderList(files),
      };
    }

    case "leer_archivo": {
      const file = await getFile(orgId, asString(args.id));
      if (!file) {
        return {
          summary: "no encontró el archivo",
          content: "No existe ningún archivo con ese id.",
        };
      }
      if (file.mime) {
        return {
          summary: `miró "${file.title}"`,
          content: `"${file.title}" es un ${file.mime} de ${fileSize(file)}. No es texto: está en la biblioteca para que lo abra una persona, y vos no lo podés leer. Nombralo en tu respuesta y seguí.`,
        };
      }
      if (file.records !== undefined) {
        return {
          summary: `miró "${file.title}" · ${file.records} registros`,
          content: `"${file.title}" es un volcado de ${file.records} registros, muy por encima de lo que podés leer. Preguntale lo que necesites con consultar_archivo, que filtra y calcula sobre todos. Llamalo sin metrica para ver qué campos tiene.`,
        };
      }
      if (file.content.length <= MAX_READ_CHARS) {
        return {
          summary: `leyó "${file.title}"`,
          content: `# ${file.title}\n\n${file.content}`,
        };
      }
      return {
        summary: `leyó "${file.title}" · parcial`,
        content: [
          `# ${file.title}`,
          file.content.slice(0, MAX_READ_CHARS),
          `[Corté acá. El archivo tiene ${file.content.length} caracteres en total; esto es el principio. Sacá lo que puedas de esta parte y decí que la viste incompleta.]`,
        ].join("\n\n"),
      };
    }

    case "guardar_archivo": {
      const contenido = asString(args.contenido);
      if (!contenido.trim()) {
        return {
          summary: "intentó guardar vacío",
          content: "No guardé nada: el contenido vino vacío.",
        };
      }
      const etiquetas = Array.isArray(args.etiquetas)
        ? args.etiquetas.filter((t): t is string => typeof t === "string")
        : [];
      const meta = await saveFile(orgId, {
        title: asString(args.titulo),
        content: contenido,
        author: agent.role,
        area: agent.department,
        tags: etiquetas,
      });
      return {
        summary: `guardó "${meta.title}"`,
        // The id is deliberately withheld: models repeat it back at the user,
        // and nothing needs it again within the same run.
        content: `Guardado en la biblioteca como "${meta.title}".`,
        fileId: meta.id,
      };
    }

    case "guardar_desde_link": {
      const url = asString(args.url).trim();
      if (!url) {
        return {
          summary: "no dio el link",
          content: "No guardé nada: vino sin url.",
        };
      }

      // What a source returned is filed the moment it comes back, so being
      // asked again for the same link means it is already here.
      const filed = await findBySourceUrl(orgId, url);
      if (filed) {
        return {
          summary: `ya estaba · "${filed.title}"`,
          content: `Ese link ya está guardado como "${filed.title}". No lo bajé de nuevo.`,
          fileId: filed.id,
        };
      }

      let file;
      try {
        file = await download(url);
      } catch (error) {
        const why = error instanceof Error ? error.message : "error desconocido";
        return {
          summary: "no pudo bajar el link",
          // A mistyped link fails exactly like an expired one, and a model that
          // reads 403 as "expired" sends the company off inventing a fix.
          content: `No pude descargarlo: ${why}. Antes de dar ninguna explicación, comprobá que el link sea idéntico al que te pasaron, carácter por carácter: si lo copiaste a mano, lo más probable es que esté mal. Buscá el archivo en la biblioteca con buscar_archivos, que suele estar ahí. Si nada de eso da, decilo y seguí.`,
        };
      }

      const shared = {
        title: asString(args.titulo).trim() || file.filename,
        author: agent.role,
        area: agent.department,
        sourceUrl: url,
        tags: Array.isArray(args.etiquetas)
          ? args.etiquetas.filter((t): t is string => typeof t === "string")
          : [],
      };
      const text = asText(file);
      const meta =
        text === null
          ? await saveBinaryFile(orgId, {
              ...shared,
              bytes: file.bytes,
              mime: file.mime,
            })
          : await saveFile(orgId, { ...shared, content: text });

      return {
        summary: `bajó "${meta.title}" · ${fileSize(meta)}`,
        content: `Descargado y guardado en la biblioteca como "${meta.title}" (${meta.mime ?? "texto"}, ${fileSize(meta)}). Decí en tu respuesta que quedó ahí, y no repitas el link: ya no hace falta.`,
        fileId: meta.id,
      };
    }

    case "volcar_de_fuente":
      return dumpFromSource(orgId, agent, sources, args);

    case "consultar_archivo":
      return queryFile(orgId, args);

    case "borrar_archivo": {
      const file = await getFile(orgId, asString(args.id));
      if (!file) {
        return {
          summary: "no encontró el archivo",
          content: "No existe ningún archivo con ese id.",
        };
      }
      await deleteFile(orgId, file.id);
      return {
        summary: `borró "${file.title}"`,
        content: `Saqué "${file.title}" de la biblioteca. Decilo en tu respuesta.`,
      };
    }

    case "crear_pendiente": {
      const task = await createTask(orgId, {
        title: asString(args.titulo),
        need: asString(args.falta),
        assignment,
        agentId: agent.id,
        author: agent.role,
        area: agent.department,
      });
      return {
        summary: `dejó pendiente "${task.title}"`,
        content: `Anotado como pendiente ${task.id}. Cuando lo contesten vas a poder seguir. Decí en tu respuesta qué te falta y que quedó anotado.`,
        taskId: task.id,
      };
    }

    case "listar_pendientes": {
      const tasks = (await listTasks(orgId)).filter((t) => t.state !== "done");
      if (tasks.length === 0) {
        return {
          summary: "miró los pendientes · ninguno abierto",
          content: "No hay pendientes abiertos.",
        };
      }
      return {
        summary: `miró los pendientes · ${tasks.length} abierto${tasks.length === 1 ? "" : "s"}`,
        content: tasks
          .map((t) =>
            [
              `${t.id} · ${t.title} · por ${t.author} · ${STATE_LABEL[t.state]}`,
              `falta: ${t.need}`,
              t.answer ? `respuesta: ${t.answer}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n"),
      };
    }

    case "cerrar_pendiente": {
      const id = asString(args.id);
      const task = await updateTask(orgId, id, { state: "done" });
      if (!task) {
        return {
          summary: "no encontró el pendiente",
          content: "No existe ningún pendiente con ese id.",
        };
      }
      return {
        summary: `cerró "${task.title}"`,
        content: `Pendiente ${task.id} marcado como resuelto.`,
        taskId: task.id,
      };
    }

    default:
      return {
        summary: `pidió una herramienta desconocida (${name})`,
        content: `No existe ninguna herramienta llamada ${name}. Usá exactamente uno de los nombres de tu lista; no la vuelvas a intentar escrita de otra forma. Si lo que necesitás no está, dejalo con crear_pendiente y seguí con el resto.`,
      };
  }
}
