import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { config, databaseConfigured } from "../config"
import * as schema from "./schema"

const client = databaseConfigured
  ? postgres(config.DATABASE_URL, { max: 5, idle_timeout: 20, connect_timeout: 10, prepare: false })
  : undefined

export const db = client ? drizzle(client, { schema }) : undefined

export async function checkDatabase(): Promise<boolean> {
  if (!client) return false
  await client`select 1`
  return true
}
