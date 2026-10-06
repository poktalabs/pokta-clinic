import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./client.js";
import { seedDemoPractice, seedQuestionnaire } from "./seed-data.js";

// Runs before the server accepts traffic: apply pending migrations, then seed the demo practice and the Questionnaire.
// Both steps are idempotent. After a resume, Render can start the service before Postgres accepts
// connections, so the first attempts may fail; retry for about a minute, then exit and let Render restart.
const ATTEMPTS = 12;
const DELAY_MS = 5000;

export async function prepareDatabase(migrationsFolder: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await migrate(db, { migrationsFolder });
      const seeded = await seedDemoPractice();
      const seededQuestionnaire = await seedQuestionnaire();
      console.log(`database ready (migrations applied${seeded ? ", demo practice seeded" : ""}${seededQuestionnaire ? ", questionnaire seeded" : ""})`);
      return;
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string }; name: string };
      const code = e.code ?? e.cause?.code ?? e.name;
      if (attempt >= ATTEMPTS) throw err;
      console.warn(`database not ready (${code}), attempt ${attempt}/${ATTEMPTS}, retrying in ${DELAY_MS / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }
}
