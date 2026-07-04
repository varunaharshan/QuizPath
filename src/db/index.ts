import "server-only";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Next.js loads .env.local on its own, but standalone scripts that import
// this module directly (db:seed via tsx) don't go through Next's bundler —
// load it explicitly here so DATABASE_URL is populated either way. Doesn't
// override real env vars already set (e.g. by a hosting platform in
// production), and quiet suppresses dotenv's console tips.
config({ path: ".env.local", quiet: true });

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
