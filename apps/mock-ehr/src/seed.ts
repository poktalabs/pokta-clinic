// `pnpm db:seed`: seeds the demo practice and the Questionnaire by hand. The server also does this on boot.
import { sql } from "./db/client.js";
import { seedDemoPractice, seedQuestionnaire } from "./db/seed-data.js";

console.log((await seedDemoPractice()) ? "seeded demo practice" : "already seeded");
console.log((await seedQuestionnaire()) ? "seeded questionnaire" : "questionnaire already seeded");
await sql.end();
