import type { NextApiRequest, NextApiResponse } from "next";
import { deleteOrgFiles, listFiles, saveFile } from "@/server/files";

/** An uploaded export arrives JSON-escaped, so the cap sits above the file. */
export const config = { api: { bodyParser: { sizeLimit: "24mb" } } };

function param(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const orgId = param(req.query.orgId);
  if (!orgId) {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }

  try {
    // The whole company was dropped from the library, files included.
    if (req.method === "DELETE") {
      await deleteOrgFiles(orgId);
      res.status(200).json({ ok: true });
      return;
    }

    // What you upload lands in the same library the agents read from.
    if (req.method === "POST") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const content = typeof body.content === "string" ? body.content : "";
      if (!content.trim()) {
        res.status(400).json({ error: "El archivo vino vacío." });
        return;
      }
      res.status(200).json({
        file: await saveFile(orgId, {
          title: typeof body.title === "string" ? body.title : "",
          content,
          author: "Vos",
          area: typeof body.area === "string" ? body.area : "",
          tags: ["adjunto"],
        }),
      });
      return;
    }

    res.status(200).json({
      files: await listFiles(orgId, {
        query: param(req.query.q),
        area: param(req.query.area),
        tag: param(req.query.tag),
        author: param(req.query.author),
        limit: 200,
      }),
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "No pude leer la biblioteca.",
    });
  }
}
