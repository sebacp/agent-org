import type { NextApiRequest, NextApiResponse } from "next";
import type { Guards } from "@/lib/guard-types";
import { isSafeId } from "@/lib/id";
import { readGuards, revokeWrite, saveGuards } from "@/server/guards";

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { orgId } = req.query;
  if (typeof orgId !== "string" || !isSafeId(orgId)) {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }

  if (req.method === "PUT") {
    res
      .status(200)
      .json({ guards: await saveGuards(orgId, parsePatch(req.body)) });
    return;
  }

  // A grant is taken back by naming it, not by sending the list back with one
  // fewer: two tabs open on the panel would each send a list from before the
  // other one changed it.
  if (req.method === "DELETE") {
    const { sourceId, tool } = req.query;
    if (typeof sourceId !== "string" || typeof tool !== "string") {
      res.status(400).json({ error: "Falta qué permiso sacar." });
      return;
    }
    res.status(200).json({ guards: await revokeWrite(orgId, sourceId, tool) });
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, PUT, DELETE");
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  res.status(200).json({ guards: await readGuards(orgId) });
}
