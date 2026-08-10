import type { AllowedSource } from "@/lib/source-types";
import type { LibraryPermission } from "@/lib/types";
import { deleteFile, getFile, listFiles, saveFile } from "@/server/files";
import { callSourceTool, grantedToolSchemas, parseToolName } from "@/server/mcp";
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

function renderList(
  files: { id: string; title: string; author: string; chars: number }[],
): string {
  if (files.length === 0) return "No hay archivos que coincidan.";
  return files
    .map((f) => `${f.id} · ${f.title} · por ${f.author} · ${f.chars} caracteres`)
    .join("\n");
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
      return {
        summary: `pidió una función que no tiene (${remote.tool})`,
        content: "No tenés acceso a esa función. Usá las que sí te dieron.",
      };
    }
    const label = source.label || "la fuente";
    try {
      return {
        summary: `consultó ${label} · ${remote.tool}`,
        content: await callSourceTool(orgId, source, remote.tool, args),
      };
    } catch (error) {
      return {
        summary: `${label} falló · ${remote.tool}`,
        content: `La fuente no respondió: ${
          error instanceof Error ? error.message : "error desconocido"
        }. Seguí con lo que tengas o dejá un pendiente.`,
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
        content: `No existe la herramienta ${name}.`,
      };
  }
}
