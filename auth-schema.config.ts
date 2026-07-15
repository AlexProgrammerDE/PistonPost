import { createSqliteDatabase } from "@/db"

import { createAuth } from "./src/auth/server"

const database = createSqliteDatabase()

export const auth = createAuth({
  database,
  baseURL: "http://localhost:3000",
  secret: "schema-generation-only-secret-at-least-32-characters",
  trustedOrigins: ["http://localhost:3000"],
  turnstileSecret: "1x0000000000000000000000000000000AA",
  production: false,
  sendEmail: async () => {},
})
