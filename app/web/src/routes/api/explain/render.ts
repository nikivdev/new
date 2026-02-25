import { createFileRoute } from "@tanstack/react-router"

const MANIM_ROOT =
  process.env.MANIM_EXPLAIN_ROOT ??
  "/Users/nikiv/repos/ManimCommunity/manim"
const MANIM_PYTHON = process.env.MANIM_EXPLAIN_PYTHON ?? "python"
const DEFAULT_OUTPUT_DIR =
  process.env.MANIM_EXPLAIN_OUTPUT_DIR ?? "/tmp/manim_renders"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

const isCloudflareRuntime = () => {
  const scope = globalThis as { WebSocketPair?: unknown; navigator?: { userAgent?: string } }
  if (typeof scope.WebSocketPair !== "undefined") return true
  const userAgent = scope.navigator?.userAgent ?? ""
  return userAgent.includes("Cloudflare-Workers")
}

type NodeDeps = {
  spawn: typeof import("node:child_process").spawn
  tmpdir: typeof import("node:os").tmpdir
  join: typeof import("node:path").join
  existsSync: typeof import("node:fs").existsSync
  mkdir: typeof import("node:fs/promises").mkdir
  writeFile: typeof import("node:fs/promises").writeFile
}

let nodeDepsPromise: Promise<NodeDeps | null> | null = null

const loadNodeDeps = async (): Promise<NodeDeps | null> => {
  if (isCloudflareRuntime()) return null
  if (nodeDepsPromise) return nodeDepsPromise
  nodeDepsPromise = (async () => {
    try {
      const [{ spawn }, { tmpdir }, { join }, { existsSync }, { mkdir, writeFile }] =
        await Promise.all([
          import("node:child_process"),
          import("node:os"),
          import("node:path"),
          import("node:fs"),
          import("node:fs/promises"),
        ])
      return { spawn, tmpdir, join, existsSync, mkdir, writeFile }
    } catch {
      return null
    }
  })()
  return nodeDepsPromise
}

const parseJsonFromOutput = (text: string) => {
  const trimmed = text.trim()
  if (!trimmed) return null
  const lines = trimmed.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim()
    if (!line) continue
    if (!line.startsWith("{")) continue
    try {
      return JSON.parse(line)
    } catch {
      continue
    }
  }
  return null
}

const runManimExplain = async (payload: unknown, options: {
  format: string
  quality: string
  outputDir: string
  deps: NodeDeps
}) => {
  const tmpRoot = options.deps.join(
    options.deps.tmpdir(),
    `manim-explain-${Date.now()}`,
  )
  await options.deps.mkdir(tmpRoot, { recursive: true })
  const inputFile = options.deps.join(tmpRoot, "explain.json")
  await options.deps.writeFile(inputFile, JSON.stringify(payload), "utf-8")

  const args = [
    "-m",
    "manim",
    "explain",
    inputFile,
    "--format",
    options.format,
    "--quality",
    options.quality,
    "--output-dir",
    options.outputDir,
    "--json",
  ]

  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
    const child = options.deps.spawn(MANIM_PYTHON, args, {
      cwd: MANIM_ROOT,
      env: process.env,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 })
    })
    child.on("error", (error) => {
      resolve({ stdout: "", stderr: error.message, code: 1 })
    })
  })
}

export const Route = createFileRoute("/api/explain/render")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as
          | {
              scene?: unknown
              format?: string
              quality?: string
              outputDir?: string
            }
          | null

        if (!body?.scene) {
          return json({ success: false, error: "Missing scene" }, 400)
        }

        const format = (body.format ?? "gif").toLowerCase()
        const quality = (body.quality ?? "medium").toLowerCase()
        const outputDir = body.outputDir ?? DEFAULT_OUTPUT_DIR

        const deps = await loadNodeDeps()
        if (!deps) {
          return json(
            {
              success: false,
              error: "Explain render is not available on this runtime",
            },
            501,
          )
        }

        if (!deps.existsSync(MANIM_ROOT)) {
          return json(
            {
              success: false,
              error: `Manim repo not found at ${MANIM_ROOT}`,
            },
            500,
          )
        }

        const payload = { scene: body.scene }

        const result = await runManimExplain(payload, {
          format,
          quality,
          outputDir,
          deps,
        })

        if (result.code !== 0) {
          return json(
            {
              success: false,
              error: result.stderr || "Manim render failed",
            },
            500,
          )
        }

        const parsed = parseJsonFromOutput(result.stdout)
        if (!parsed || !parsed.success) {
          return json(
            {
              success: false,
              error: "Failed to parse manim output",
              detail: result.stdout,
            },
            500,
          )
        }

        if (parsed.results && Array.isArray(parsed.results)) {
          const first = parsed.results[0]
          return json({
            success: true,
            url: first?.url,
            path: first?.path,
            format: first?.format ?? format,
          })
        }

        return json({
          success: true,
          url: parsed.url,
          path: parsed.path,
          format: parsed.format ?? format,
        })
      },
    },
  },
})
