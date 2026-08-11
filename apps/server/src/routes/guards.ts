import { Router, json } from "express";
import type { Guards } from "@agent-org/shared/guard-types";
import { isSafeId } from "@agent-org/shared/id";
import { readGuards, revokeWrite, saveGuards } from "../core/guards";

function parsePatch(body: unknown): Partial<Guards> {
  const raw = (body ?? {}) as Record<string, unknown>;
  return {
    ...(typeof raw.monthlyCap === "number" && Number.isFinite(raw.monthlyCap)
      ? { monthlyCap: Math.max(raw.monthlyCap, 0) }
      : {}),
    ...(typeof raw.approveWrites === "boolean"
      ? { approveWrites: raw.approveWrites }
      : {}),
  };
}

export const guardsRouter = Router();

guardsRouter.use((req, res, next) => {
  const { orgId } = req.query;
  if (typeof orgId !== "string" || !isSafeId(orgId)) {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }
  next();
});

guardsRouter.get("/", async (req, res) => {
  res.status(200).json({ guards: await readGuards(req.query.orgId as string) });
});

guardsRouter.put("/", json({ limit: "1mb" }), async (req, res) => {
  res.status(200).json({
    guards: await saveGuards(req.query.orgId as string, parsePatch(req.body)),
  });
});

// A grant is taken back by naming it, not by sending the list back with one
// fewer: two tabs open on the panel would each send a list from before the
// other one changed it.
guardsRouter.delete("/", async (req, res) => {
  const { sourceId, tool } = req.query;
  if (typeof sourceId !== "string" || typeof tool !== "string") {
    res.status(400).json({ error: "Falta qué permiso sacar." });
    return;
  }
  res.status(200).json({
    guards: await revokeWrite(req.query.orgId as string, sourceId, tool),
  });
});

guardsRouter.all("/", (_req, res) => {
  res.setHeader("Allow", "GET, PUT, DELETE");
  res.status(405).json({ error: "Método no permitido." });
});
