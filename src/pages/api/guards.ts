import type { NextApiRequest, NextApiResponse } from "next";
import type { Guards } from "@/lib/guard-types";
import { isSafeId } from "@/lib/id";
import { readGuards, saveGuards } from "@/server/guards";

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
    res.status(200).json({ guards: await saveGuards(orgId, parsePatch(req.body)) });
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, PUT");
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  res.status(200).json({ guards: await readGuards(orgId) });
}
