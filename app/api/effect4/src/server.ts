import { Effect } from "effect"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"

type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type ChatRequest = {
  model?: string
  messages: ChatMessage[]
}

const env = {
  port: Number(process.env.PORT ?? 9031),
  apiToken: process.env.API_TOKEN ?? "dev-token",
  rootPassword: process.env.ROOT_PASSWORD ?? "dev-password",
}

class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const run = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromise(effect)

const readBodyEffect = (req: IncomingMessage) =>
  Effect.tryPromise({
    try: () =>
      new Promise<string>((resolve, reject) => {
        let data = ""
        req.on("data", (chunk) => {
          data += chunk
        })
        req.on("end", () => resolve(data))
        req.on("error", reject)
      }),
    catch: (error) => new Error(`Failed to read body: ${String(error)}`),
  })

const parseJsonEffect = <T>(raw: string) =>
  Effect.try({
    try: () => JSON.parse(raw) as T,
    catch: () => new HttpError(400, "invalid_json", "Invalid JSON body"),
  })

const sendJson = (res: ServerResponse, status: number, payload: unknown): void => {
  res.statusCode = status
  res.setHeader("content-type", "application/json")
  res.end(JSON.stringify(payload))
}

const getBearer = (req: IncomingMessage): string | null => {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith("Bearer ")) return null
  return auth.slice(7).trim()
}

const requireAuth = (req: IncomingMessage, res: ServerResponse): boolean => {
  const token = getBearer(req)
  if (!token || token !== env.apiToken) {
    sendJson(res, 401, { error: { code: "unauthorized", message: "Unauthorized" } })
    return false
  }
  return true
}

const sendSseHeaders = (res: ServerResponse): void => {
  res.statusCode = 200
  res.setHeader("content-type", "text/event-stream")
  res.setHeader("cache-control", "no-cache")
  res.setHeader("connection", "keep-alive")
}

const normalizeChatRequest = (payload: ChatRequest): ChatMessage[] => {
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    throw new HttpError(400, "invalid_request", "messages[] is required")
  }

  const invalid = payload.messages.find(
    (m) =>
      !m ||
      typeof m !== "object" ||
      !["system", "user", "assistant"].includes((m as ChatMessage).role) ||
      typeof (m as ChatMessage).content !== "string",
  )
  if (invalid) {
    throw new HttpError(
      400,
      "invalid_request",
      "Each message must include role and string content",
    )
  }

  return payload.messages
}

const completionFromMessages = (messages: ChatMessage[]): string => {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? ""
  if (!lastUser.trim()) return "Hello. Send a user message to start."
  return `Starter Effect 4 API response: ${lastUser}`
}

const streamText = (res: ServerResponse, text: string): void => {
  const chunks = text.split(/\s+/).filter(Boolean)
  let i = 0
  const tick = () => {
    if (i >= chunks.length) {
      res.write("data: [DONE]\n\n")
      res.end()
      return
    }
    const token = `${chunks[i]} `
    i += 1
    res.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`,
    )
    setTimeout(tick, 35)
  }
  tick()
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
    const path = url.pathname
    const method = req.method ?? "GET"

    if (method === "GET" && path === "/health") {
      sendJson(res, 200, { status: "ok", service: "starter-effect4-api" })
      return
    }

    if (method === "POST" && path === "/api/auth/login") {
      const raw = await run(readBodyEffect(req))
      const parsed = await run(parseJsonEffect<{ password?: string }>(raw))
      if ((parsed.password ?? "") !== env.rootPassword) {
        sendJson(res, 401, { error: { code: "invalid_password", message: "Invalid password" } })
        return
      }
      sendJson(res, 200, { token: env.apiToken, userId: "root" })
      return
    }

    if (method === "GET" && path === "/api/auth/session") {
      if (!requireAuth(req, res)) return
      sendJson(res, 200, { userId: "root" })
      return
    }

    if (
      method === "POST" &&
      (path === "/v1/chat/completions" || path === "/chat/completions" || path === "/free")
    ) {
      if (!requireAuth(req, res)) return

      const raw = await run(readBodyEffect(req))
      const payload = await run(parseJsonEffect<ChatRequest>(raw))
      const messages = normalizeChatRequest(payload)

      sendSseHeaders(res)
      streamText(res, completionFromMessages(messages))
      return
    }

    sendJson(res, 404, { error: { code: "not_found", message: "Not found" } })
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, {
        error: { code: error.code, message: error.message },
      })
      return
    }
    sendJson(res, 500, {
      error: { code: "internal_error", message: String(error) },
    })
  }
})

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`starter-effect4-api listening on http://127.0.0.1:${env.port}`)
})
