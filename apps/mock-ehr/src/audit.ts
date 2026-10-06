import { db } from "./db/client.js";
import { auditEvent } from "./db/schema.js";

export async function audit(actor: string, action: string, resourceType: string, resourceId: string | null, detail?: unknown) {
  await db.insert(auditEvent).values({ actor, action, resourceType, resourceId, detail: detail ?? null });
}
