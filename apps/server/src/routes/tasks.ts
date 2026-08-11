import { Router, json } from "express";
import type { TaskAttachment } from "@agent-org/shared/task-types";
import { deleteTask, listTasks, updateTask } from "../core/tasks";

export const tasksRouter = Router();

tasksRouter.use((req, res, next) => {
  if (typeof req.query.orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }
  next();
});

tasksRouter.delete("/", async (req, res) => {
  const { orgId, id } = req.query;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Falta el pendiente." });
    return;
  }
  try {
    await deleteTask(orgId as string, id);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "No pude leer los pendientes.",
    });
  }
});

tasksRouter.patch("/", json({ limit: "1mb" }), async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.id !== "string" || typeof body.answer !== "string") {
    res.status(400).json({ error: "Pedido inválido." });
    return;
  }
  try {
    const task = await updateTask(req.query.orgId as string, body.id, {
      answer: body.answer,
      attachments: Array.isArray(body.attachments)
        ? (body.attachments as TaskAttachment[])
        : undefined,
    });
    if (!task) {
      res.status(404).json({ error: "No existe ese pendiente." });
      return;
    }
    res.status(200).json({ task });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "No pude leer los pendientes.",
    });
  }
});

tasksRouter.get("/", async (req, res) => {
  try {
    res.status(200).json({ tasks: await listTasks(req.query.orgId as string) });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "No pude leer los pendientes.",
    });
  }
});
