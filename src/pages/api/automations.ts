import type { NextApiRequest, NextApiResponse } from "next";
import {
  createAutomation,
  deleteAutomation,
  listAutomations,
  patchAutomation,
} from "@/server/automations";
import { runAutomation } from "@/server/scheduler";

export const config = { api: { bodyParser: { sizeLimit: "256kb" } } };

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
    if (req.method === "POST") {
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
      return;
    }

    if (req.method === "PATCH") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.id !== "string") {
        res.status(400).json({ error: "Falta la automatización." });
        return;
      }
      // Only the form's half: the counters and the last corrida are the
      // scheduler's to write, not the browser's.
      const automation = await patchAutomation(orgId, body.id, {
        name: body.name as string | undefined,
        cron: body.cron as string | undefined,
        timezone: body.timezone as string | undefined,
        task: body.task as string | undefined,
        agentId: body.agentId as string | undefined,
        enabled: body.enabled as boolean | undefined,
      });
      if (!automation) {
        res.status(404).json({ error: "No existe esa automatización." });
        return;
      }
      res.status(200).json({ automation });
      return;
    }

    if (req.method === "DELETE") {
      if (typeof id !== "string") {
        res.status(400).json({ error: "Falta la automatización." });
        return;
      }
      await deleteAutomation(orgId, id);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(200).json({ automations: await listAutomations(orgId) });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "No pude leer las automatizaciones.",
    });
  }
}
