import express, { type Express } from "express";
import { approvalsRouter } from "./routes/approvals";
import { automationsRouter } from "./routes/automations";
import { filesRouter } from "./routes/files";
import { guardsRouter } from "./routes/guards";
import { orgRouter } from "./routes/org";
import { runRouter } from "./routes/run";
import { sourcesRouter } from "./routes/sources";
import { tasksRouter } from "./routes/tasks";
import { runsRouter, threadsRouter } from "./routes/threads";
import { eventsRouter, watchRouter } from "./routes/watch";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  // Every reply is either JSON for one tab or a stream: none of it is worth
  // revalidating, and an ETag on a corrida in progress is a lie.
  app.set("etag", false);

  app.get("/api/salud", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use("/api/org", orgRouter);
  app.use("/api/threads", threadsRouter);
  app.use("/api/runs", runsRouter);
  app.use("/api/run", runRouter);
  app.use("/api/watch", watchRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/guards", guardsRouter);
  app.use("/api/approvals", approvalsRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/automations", automationsRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/sources", sourcesRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "No existe ese endpoint." });
  });

  return app;
}
