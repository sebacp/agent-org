import type { NextApiRequest, NextApiResponse } from "next";
import type { SourceDef, SourceProbe } from "@/lib/source-types";
import { closeSource, listSourceTools } from "@/server/mcp";
import {
  deleteSource,
  listSources,
  saveSource,
  toView,
  type SourceInput,
} from "@/server/sources";

/** Connecting is the only honest test, so saving one always tries it. */
async function probe(orgId: string, source: SourceDef): Promise<SourceProbe> {
  if (!source.enabled) return { tools: [] };
  try {
    const tools = await listSourceTools(orgId, source);
    return { tools: tools.map((t) => t.function.name) };
  } catch (error) {
    return {
      tools: [],
      error: error instanceof Error ? error.message : "No pude conectar.",
    };
  }
}

function parseBody(body: unknown): SourceInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  return {
    id: text(raw.id),
    label: text(raw.label),
    // Left undefined when absent, so a bare `{ id }` post is just a re-probe.
    transport:
      raw.transport === "stdio"
        ? "stdio"
        : raw.transport === "http"
          ? "http"
          : undefined,
    url: text(raw.url),
    token: text(raw.token),
    command: text(raw.command),
    departments: Array.isArray(raw.departments)
      ? raw.departments.filter((d): d is string => typeof d === "string")
      : undefined,
    readOnly: typeof raw.readOnly === "boolean" ? raw.readOnly : undefined,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { orgId, id } = req.query;
  if (typeof orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }

  try {
    if (req.method === "DELETE") {
      if (typeof id !== "string") {
        res.status(400).json({ error: "Falta la fuente." });
        return;
      }
      closeSource(orgId, id);
      await deleteSource(orgId, id);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "POST") {
      const source = await saveSource(orgId, parseBody(req.body));
      // Editing the connection details invalidates whatever was open.
      closeSource(orgId, source.id);
      res.status(200).json({
        source: toView(source),
        probe: await probe(orgId, source),
      });
      return;
    }

    res.status(200).json({
      sources: (await listSources(orgId)).map(toView),
    });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "No pude leer las fuentes.",
    });
  }
}
