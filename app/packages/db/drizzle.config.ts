import type { Config } from "drizzle-kit"

export default {
  schema: [
    "./src/schema/users.ts",
    "./src/schema/chat.ts",
    "./src/schema/usage.ts",
    "./src/schema/canvases.ts",
  ],
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_URL || "file:local.db",
  },
} satisfies Config
