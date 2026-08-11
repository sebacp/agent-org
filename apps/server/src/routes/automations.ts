import { Router, json } from "express";
import {
  createAutomation,
  deleteAutomation,
  listAutomations,
  patchAutomation,
} from "../core/automations";
import { runAutomation } from "../core/scheduler";

export const automationsRouter = Router();

automationsRouter.use(json({ limit: "256kb" }), (req, res, next) => {
  if (typeof req.query.orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }
  next();
});

function failed(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No pude leer las automatizaciones.";
}

automationsRouter.post("/", async (req, res) => {
  const { orgId, id } = req.query as Record<string, string>;
  try {
    // Running one by hand is the only way to find out whether the pedido was
    // any good without waiting for the hour to come around.
    if (req.query.correr === "1") {
      if (typeof id !== "string") {
        res.status(400).json({ error: "Falta la automatización." });
        return;
      }
      const found = (await listAutomations(orgId)).find((a) => a.id === id);
      if (!found) {
        res.status(404).json({ error: "No existe esa automatización." });
        return;
      }
      await runAutomation(orgId, found);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(200).json({
      automation: await createAutomation(orgId, req.body as object),
    });
  } catch (error) {
    res.status(400).json({ error: failed(error) });
  }
});

automationsRouter.patch("/", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.id !== "string") {
    res.status(400).json({ error: "Falta la automatización." });
    return;
  }
  try {
    // Only the form's half: the counters and the last corrida are the
    // scheduler's to write, not the browser's.
    const automation = await patchAutomation(
      req.query.orgId as string,
      body.id,
      {
        name: body.name as string | undefined,
        cron: body.cron as string | undefined,
        timezone: body.timezone as string | undefined,
        task: body.task as string | undefined,
        agentId: body.agentId as string | undefined,
        enabled: body.enabled as boolean | undefined,
      },
    );
    if (!automation) {
      res.status(404).json({ error: "No existe esa automatización." });
      return;
    }
    res.status(200).json({ automation });
  } catch (error) {
    res.status(400).json({ error: failed(error) });
  }
});

automationsRouter.delete("/", async (req, res) => {
  const { orgId, id } = req.query as Record<string, string>;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Falta la automatización." });
    return;
  }
  try {
    await deleteAutomation(orgId, id);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: failed(error) });
  }
});

automationsRouter.get("/", async (req, res) => {
  try {
    res.status(200).json({
      automations: await listAutomations(req.query.orgId as string),
    });
  } catch (error) {
    res.status(400).json({ error: failed(error) });
  }
});
