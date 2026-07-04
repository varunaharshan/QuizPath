import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit's CLI reads this file directly, outside Next's env loading and
// outside src/db/index.ts — load .env.local explicitly here too.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
