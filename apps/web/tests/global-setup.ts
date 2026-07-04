import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/peakstreak_test"

/** Creates the throwaway test database and applies migrations. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL)
  const dbName = url.pathname.slice(1)
  const adminUrl = new URL(TEST_DATABASE_URL)
  adminUrl.pathname = "/postgres"

  const admin = new Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  const exists = await admin.query("select 1 from pg_database where datname = $1", [dbName])
  if (exists.rowCount === 0) {
    await admin.query(`create database "${dbName}"`)
  }
  await admin.end()

  const client = new Client({ connectionString: TEST_DATABASE_URL })
  await client.connect()
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" })
  await client.end()
}
