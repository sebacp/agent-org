import { Router, json } from "express";
import { parseSnapshot, writeOrg } from "../core/org";

export const orgRouter = Router();

orgRouter.put("/", json({ limit: "1mb" }), async (req, res) => {
  const { orgId } = req.query;
  if (typeof orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }

  try {
    const stored = await writeOrg(orgId, parseSnapshot(req.body));
    res.status(200).json({ savedAt: stored.savedAt });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "No pude guardar la empresa.",
    });
  }
});

orgRouter.all("/", (_req, res) => {
  res.setHeader("Allow", "PUT");
  res.status(405).json({ error: "Método no permitido." });
});
