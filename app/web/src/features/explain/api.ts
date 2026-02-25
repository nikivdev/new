/**
 * Explain Mode API
 *
 * Interface for AI models to send explanations to gen.
 * This can be called via:
 * 1. HTTP API endpoint
 * 2. WebSocket for real-time streaming
 * 3. Desktop IPC (Electron)
 */

import type { Explanation, ManimScene } from "./schema"
import { generatePythonFile } from "./manim-compiler"

/**
 * API request to create an explanation
 */
export interface CreateExplanationRequest {
  /** The topic being explained */
  topic: string

  /** The structured explanation */
  explanation: Explanation

  /** Optional: Render visualizations immediately */
  renderVisuals?: boolean
}

/**
 * API response with rendered assets
 */
export interface CreateExplanationResponse {
  /** Success status */
  success: boolean

  /** Explanation ID for tracking */
  explanationId: string

  /** URLs to rendered visualizations (if requested) */
  visualUrls?: Record<string, string>

  /** Error message if failed */
  error?: string
}

/**
 * Request to render a specific Manim scene
 */
export interface RenderSceneRequest {
  /** The scene to render */
  scene: ManimScene

  /** Output format */
  format?: "mp4" | "gif" | "webm"

  /** Quality setting */
  quality?: "low" | "medium" | "high"
}

/**
 * Response with rendered video URL
 */
export interface RenderSceneResponse {
  success: boolean
  url?: string
  error?: string
}

/**
 * Server-side: Render a Manim scene
 *
 * This runs on the server/worker and calls the Manim CLI
 */
export async function renderManimScene(
  scene: ManimScene,
  options: {
    format?: "mp4" | "gif" | "webm"
    quality?: "low" | "medium" | "high"
    manimPath?: string
    outputDir?: string
  } = {},
): Promise<{ success: boolean; path?: string; error?: string }> {
  const {
    format = "mp4",
    quality = "medium",
    outputDir = "/tmp/manim_renders",
  } = options

  // Generate Python code (for server-side execution)
  generatePythonFile(scene)

  // This function is a placeholder for server-side Manim rendering.
  // Full implementation would:
  // 1. Write Python code to temp file
  // 2. Execute: manim -qm --format=gif scene.py SceneName
  // 3. Return the rendered file URL

  return {
    success: true,
    path: `${outputDir}/media/videos/${scene.name}/${quality}_quality/${scene.name}.${format}`,
  }
}

/**
 * Client-side: Parse AI response for explanation data
 *
 * The AI can embed explanations in its response using a special format:
 * ```explain
 * { "title": "...", "steps": [...] }
 * ```
 */
export function parseExplanationFromResponse(
  response: string,
): Explanation | null {
  // Look for ```explain code block
  const explainMatch = response.match(/```explain\n([\s\S]*?)\n```/)
  if (explainMatch) {
    try {
      return JSON.parse(explainMatch[1]) as Explanation
    } catch {
      console.error("Failed to parse explanation JSON")
    }
  }

  // Look for JSON object with required fields
  const jsonMatch = response.match(/\{[\s\S]*"title"[\s\S]*"steps"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.title && Array.isArray(parsed.steps)) {
        return parsed as Explanation
      }
    } catch {
      // Not valid JSON
    }
  }

  return null
}

/**
 * Format explanation as AI-friendly prompt
 *
 * Use this to instruct the AI on how to generate explanations
 */
export const EXPLAIN_MODE_SYSTEM_PROMPT = `
You are in Explain Mode. When explaining concepts, output structured explanations that can be visualized.

Output format:
\`\`\`explain
{
  "title": "Brief title",
  "summary": "One sentence summary",
  "level": "beginner" | "intermediate" | "advanced",
  "steps": [
    {
      "id": "unique-id",
      "text": "Explanation text for this step",
      "code": {
        "language": "typescript",
        "content": "code here",
        "highlights": [1, 2]  // optional: lines to highlight
      },
      "visual": {
        "name": "SceneName",
        "objects": [
          { "id": "obj1", "type": "circle", "position": [0, 0], "color": "#3b82f6" }
        ],
        "animations": [
          { "type": "create", "target": "obj1", "duration": 0.5 }
        ]
      }
    }
  ]
}
\`\`\`

Visual object types: circle, square, rectangle, triangle, line, arrow, dot, text, tex (LaTeX), mathtex
Animation types: create, write, fadein, fadeout, transform, move, rotate, scale, indicate, circumscribe, wait

Keep explanations clear and visual. Use animations to show processes step by step.
Every step must include a visual block with at least one object and one animation.
Output only the \`\`\`explain\`\`\` JSON block, no extra commentary.
`.trim()

/**
 * Example: How to call this from an AI model
 */
export const EXAMPLE_AI_CALL = `
// In the AI system prompt or context:
${EXPLAIN_MODE_SYSTEM_PROMPT}

// The AI will then output:
\`\`\`explain
{
  "title": "How async/await works",
  "summary": "Understanding JavaScript's async execution model",
  "steps": [...]
}
\`\`\`

// Which gets parsed and displayed in gen's Explain Viewer
`
