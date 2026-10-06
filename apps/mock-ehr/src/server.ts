import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { prepareDatabase } from "./db/bootstrap.js";

// `../drizzle` from both src/server.ts (dev) and dist/server.js (the image).
await prepareDatabase(fileURLToPath(new URL("../drizzle", import.meta.url)));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => console.log(`Expediente Demo listening on :${info.port}`));
