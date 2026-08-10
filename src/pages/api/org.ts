import type { NextApiRequest, NextApiResponse } from "next";
import { parseSnapshot, writeOrg } from "@/server/org";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "PUT") {
    res.setHeader("Allow", "PUT");
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const { orgId } = req.query;
  if (typeof orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }

  try {
    const stored = await writeOrg(orgId, parseSnapshot(req.body));
    res.status(200).json({ savedAt: stored.savedAt });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "No pude guardar la empresa.",
    });
  }
}
