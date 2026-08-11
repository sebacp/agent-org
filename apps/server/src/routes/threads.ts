import { Router } from "express";
import { deleteThread, listThreads } from "../core/threads";
import { listRuns } from "../core/runs";

export const threadsRouter = Router();

threadsRouter.delete("/", async (req, res) => {
  const { orgId, id } = req.query;
  if (typeof orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }
  if (typeof id !== "string") {
    res.status(400).json({ error: "Falta el hilo." });
    return;
  }

  try {
    await deleteThread(orgId, id);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "No pude leer los hilos.",
    });
  }
});

threadsRouter.get("/", async (req, res) => {
  const { orgId } = req.query;
  if (typeof orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }

  try {
    res.status(200).json({ threads: await listThreads(orgId) });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "No pude leer los hilos.",
    });
  }
});

/** What the company is doing right now, including with no tab of yours open. */
export const runsRouter = Router();

runsRouter.get("/", (req, res) => {
  const { orgId } = req.query;
  if (typeof orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }
  res.status(200).json({ runs: listRuns(orgId) });
});
