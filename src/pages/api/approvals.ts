import type { NextApiRequest, NextApiResponse } from "next";
import { isSafeId } from "@/lib/id";
import {
  answerApproval,
  findApproval,
  listApprovals,
} from "@/server/approvals";
import { grantWrite } from "@/server/guards";

/**
 * The answer comes in on its own request: the one holding the tool call is the
 * corrida itself, parked mid-run, and the tab answering is often not even the
 * one that set it off.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { orgId } = req.query;
  if (typeof orgId !== "string" || !isSafeId(orgId)) {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }

  if (req.method === "POST") {
    const raw = (req.body ?? {}) as Record<string, unknown>;
    if (typeof raw.id !== "string" || typeof raw.ok !== "boolean") {
      res.status(400).json({ error: "Falta qué autorizar." });
      return;
    }

    // What is being granted comes off the parked call rather than off the
    // request, so "no volver a preguntar" can only ever mean the function that
    // was on screen when it was pressed.
    if (raw.ok && raw.always === true) {
      const write = findApproval(orgId, raw.id);
      if (write) {
        await grantWrite(orgId, {
          sourceId: write.sourceId,
          sourceLabel: write.source.label,
          tool: write.tool,
        });
      }
    }

    // False when it timed out or the corrida was cut while you were reading it,
    // which the tab shows rather than swallows: nothing ran either way.
    res.status(200).json({ answered: answerApproval(orgId, raw.id, raw.ok) });
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  res.status(200).json({ approvals: listApprovals(orgId) });
}
