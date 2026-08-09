import type { NextApiRequest, NextApiResponse } from "next";
import { deleteTask, listTasks, updateTask } from "@/server/tasks";

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
        res.status(400).json({ error: "Falta el pendiente." });
        return;
      }
      await deleteTask(orgId, id);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "PATCH") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.id !== "string" || typeof body.answer !== "string") {
        res.status(400).json({ error: "Pedido inválido." });
        return;
      }
      const task = await updateTask(orgId, body.id, { answer: body.answer });
      if (!task) {
        res.status(404).json({ error: "No existe ese pendiente." });
        return;
      }
      res.status(200).json({ task });
      return;
    }

    res.status(200).json({ tasks: await listTasks(orgId) });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "No pude leer los pendientes.",
    });
  }
}
