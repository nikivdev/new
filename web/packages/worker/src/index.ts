import { Hono } from "hono"
import { cors } from "hono/cors"

const app = new Hono()

app.use("*", cors())

app.get("/", (c) => {
  return c.json({ message: "Hello from worker" })
})

app.get("/health", (c) => {
  return c.json({ status: "ok" })
})

export default app
