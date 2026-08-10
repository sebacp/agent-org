import type { NextApiRequest, NextApiResponse } from "next";
import { listRuns } from "@/server/runs";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { orgId } = req.query;
  if (typeof orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }
  res.status(200).json({ runs: listRuns(orgId) });
}
