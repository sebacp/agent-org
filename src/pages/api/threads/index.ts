import type { NextApiRequest, NextApiResponse } from "next";
import { deleteThread, listThreads } from "@/server/threads";

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
        res.status(400).json({ error: "Falta el hilo." });
        return;
      }
      await deleteThread(orgId, id);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(200).json({ threads: await listThreads(orgId) });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "No pude leer los hilos.",
    });
  }
}
