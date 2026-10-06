// `pnpm db:seed`: seeds the demo practice by hand. The server also does this on boot.
import { sql } from "./db/client.js";
import { seedDemoPractice } from "./db/seed-data.js";

console.log((await seedDemoPractice()) ? "seeded demo practice" : "already seeded");
await sql.end();
