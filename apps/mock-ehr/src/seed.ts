// `pnpm db:seed`: seeds the demo network and the Questionnaire by hand. The server also does this on boot.
import { sql } from "./db/client.js";
import { seedDemoNetwork, seedQuestionnaire } from "./db/seed-data.js";

console.log((await seedDemoNetwork()) ? "seeded demo network" : "demo network already seeded");
console.log((await seedQuestionnaire()) ? "seeded questionnaire" : "questionnaire already seeded");
await sql.end();
