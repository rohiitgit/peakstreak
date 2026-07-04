import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { env } from "@/lib/env"
import * as schema from "./schema"

const globalForDb = globalThis as unknown as { pgPool?: Pool }

// Reuse the pool across dev hot-reloads so we don't leak connections.
const pool = (globalForDb.pgPool ??= new Pool({
  connectionString: env().DATABASE_URL,
  max: 10,
}))

export const db = drizzle(pool, { schema, casing: "snake_case" })

export type Db = typeof db
export { schema }
