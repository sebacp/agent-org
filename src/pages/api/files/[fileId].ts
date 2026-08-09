import type { NextApiRequest, NextApiResponse } from "next";
import { deleteFile, getFile } from "@/server/files";

/** The viewer only has to be readable, so a big export travels as a head. */
const PREVIEW_CHARS = 40_000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { orgId, fileId } = req.query;
  if (typeof orgId !== "string" || typeof fileId !== "string") {
    res.status(400).json({ error: "Falta la empresa o el archivo." });
    return;
  }

  try {
    if (req.method === "DELETE") {
      await deleteFile(orgId, fileId);
      res.status(200).json({ ok: true });
      return;
    }

    const file = await getFile(orgId, fileId);
    if (!file) {
      res.status(404).json({ error: "No existe ese archivo." });
      return;
    }
    // `chars` still carries the real length, so the client can say it cut.
    res.status(200).json({
      file: { ...file, content: file.content.slice(0, PREVIEW_CHARS) },
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "No pude leer el archivo.",
    });
  }
}
