import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL ?? "postgres://ehr:ehr@localhost:5434/expediente";
export const sql = postgres(url, { max: 5 });
export const db = drizzle(sql, { schema });
export type Db = typeof db;
