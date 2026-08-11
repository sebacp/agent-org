import { Router, json } from "express";
import { isImage } from "@agent-org/shared/file-types";
import {
  deleteFile,
  deleteOrgFiles,
  getFile,
  listFiles,
  readFileBytes,
  readThumb,
  saveFile,
} from "../core/files";

/** The viewer only has to be readable, so a big export travels as a head. */
const PREVIEW_CHARS = 40_000;

function param(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const filesRouter = Router();

/** An uploaded export arrives JSON-escaped, so the cap sits above the file. */
filesRouter.use(json({ limit: "24mb" }));

// The whole company was dropped from the library, files included.
filesRouter.delete("/", async (req, res) => {
  const orgId = param(req.query.orgId);
  if (!orgId) {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }
  try {
    await deleteOrgFiles(orgId);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "No pude leer la biblioteca.",
    });
  }
});

// What you upload lands in the same library the agents read from.
filesRouter.post("/", async (req, res) => {
  const orgId = param(req.query.orgId);
  if (!orgId) {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) {
    res.status(400).json({ error: "El archivo vino vacío." });
    return;
  }
  try {
    res.status(200).json({
      file: await saveFile(orgId, {
        title: typeof body.title === "string" ? body.title : "",
        content,
        author: "Vos",
        area: typeof body.area === "string" ? body.area : "",
        tags: ["adjunto"],
      }),
    });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "No pude leer la biblioteca.",
    });
  }
});

filesRouter.get("/", async (req, res) => {
  const orgId = param(req.query.orgId);
  if (!orgId) {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }
  try {
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
      error:
        error instanceof Error ? error.message : "No pude leer la biblioteca.",
    });
  }
});

filesRouter.delete("/:fileId", async (req, res) => {
  const { orgId } = req.query;
  if (typeof orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa o el archivo." });
    return;
  }
  try {
    await deleteFile(orgId, req.params.fileId);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "No pude leer el archivo.",
    });
  }
});

filesRouter.get("/:fileId", async (req, res) => {
  const { orgId } = req.query;
  const { fileId } = req.params;
  if (typeof orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa o el archivo." });
    return;
  }

  try {
    const file = await getFile(orgId, fileId);
    if (!file) {
      res.status(404).json({ error: "No existe ese archivo." });
      return;
    }

    // The library shows a picture of every image on the shelf, and the shelf
    // is one request per row: sending the original for that would be megabytes
    // to draw something the size of a favicon.
    if (req.query.thumb !== undefined && isImage(file)) {
      const thumb = await readThumb(orgId, fileId);
      if (!thumb) {
        res.status(404).json({ error: "No pude hacer la miniatura." });
        return;
      }
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.status(200).send(thumb);
      return;
    }

    // What isn't text has to come back as itself for an <img> or a download to
    // do anything with it. A body never changes once filed, so it caches.
    if (req.query.raw !== undefined && file.mime) {
      const bytes = await readFileBytes(orgId, fileId);
      if (!bytes) {
        res.status(404).json({ error: "El archivo se quedó sin cuerpo." });
        return;
      }
      res.setHeader("Content-Type", file.mime);
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.status(200).send(bytes);
      return;
    }

    // `chars` still carries the real length, so the client can say it cut.
    res.status(200).json({
      file: { ...file, content: file.content.slice(0, PREVIEW_CHARS) },
    });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "No pude leer el archivo.",
    });
  }
});
