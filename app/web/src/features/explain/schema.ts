/**
 * Explain Mode Schema
 *
 * This defines the interface for AI-generated explanations with visualizations.
 * The AI outputs structured data that can be rendered via Manim.
 */

/**
 * A single step in an explanation with optional visualization
 */
export interface ExplainStep {
  /** Unique ID for this step */
  id: string

  /** The explanation text */
  text: string

  /** Optional Manim visualization for this step */
  visual?: ManimScene

  /** Duration in seconds (for pacing) */
  duration?: number

  /** Code snippet to highlight (if explaining code) */
  code?: {
    language: string
    content: string
    highlights?: number[] // line numbers to highlight
  }
}

/**
 * A complete explanation with multiple steps
 */
export interface Explanation {
  /** Title of the explanation */
  title: string

  /** Brief summary */
  summary: string

  /** The steps of the explanation */
  steps: ExplainStep[]

  /** Overall difficulty level */
  level?: "beginner" | "intermediate" | "advanced"

  /** Tags for categorization */
  tags?: string[]
}

/**
 * Manim scene specification
 *
 * This is what the AI outputs to describe a visualization.
 * It gets compiled to Python Manim code.
 */
export interface ManimScene {
  /** Scene name (used for class name) */
  name: string

  /** Objects to create */
  objects: ManimObject[]

  /** Animations to play in sequence */
  animations: ManimAnimation[]

  /** Background color (hex) */
  backgroundColor?: string

  /** Camera settings */
  camera?: {
    frameWidth?: number
    frameHeight?: number
  }
}

/**
 * A Manim object (mobject)
 */
export interface ManimObject {
  /** Unique ID for referencing */
  id: string

  /** Object type */
  type: ManimObjectType

  /** Position [x, y] or [x, y, z] */
  position?: number[]

  /** Color (hex or named) */
  color?: string

  /** Fill opacity (0-1) */
  fillOpacity?: number

  /** Stroke width */
  strokeWidth?: number

  /** Type-specific properties */
  props?: Record<string, unknown>
}

export type ManimObjectType =
  | "circle"
  | "square"
  | "rectangle"
  | "triangle"
  | "line"
  | "arrow"
  | "dot"
  | "text"
  | "tex" // LaTeX
  | "mathtex" // Math LaTeX
  | "numberline"
  | "axes"
  | "graph" // function graph
  | "barchart"
  | "group"

/**
 * A Manim animation
 */
export interface ManimAnimation {
  /** Animation type */
  type: ManimAnimationType

  /** Target object ID(s) */
  target: string | string[]

  /** Duration in seconds */
  duration?: number

  /** Animation-specific params */
  params?: Record<string, unknown>
}

export type ManimAnimationType =
  | "create" // Create/Draw
  | "write" // Write text
  | "fadein"
  | "fadeout"
  | "transform" // Transform to another object
  | "move" // Move to position
  | "rotate"
  | "scale"
  | "indicate" // Flash/highlight
  | "circumscribe" // Draw around
  | "wait"

/**
 * Example explanation for Effect.gen:
 */
export const exampleExplanation: Explanation = {
  title: "Understanding Effect.gen",
  summary: "Learn how Effect.gen replaces async/await with generator functions",
  level: "intermediate",
  tags: ["effect", "typescript", "async"],
  steps: [
    {
      id: "step-1",
      text: "In traditional TypeScript, we use async/await to handle asynchronous operations sequentially.",
      code: {
        language: "typescript",
        content: `async function fetchUser(id: string) {
  const response = await fetch(\`/users/\${id}\`)
  const user = await response.json()
  return user
}`,
      },
      visual: {
        name: "AsyncAwaitFlow",
        objects: [
          { id: "box1", type: "rectangle", position: [-4, 0], color: "#3b82f6", props: { width: 2, height: 1 } },
          { id: "text1", type: "text", position: [-4, 0], color: "#ffffff", props: { text: "fetch()" } },
          { id: "arrow1", type: "arrow", color: "#94a3b8", props: { start: [-3, 0], end: [-1, 0] } },
          { id: "box2", type: "rectangle", position: [0, 0], color: "#3b82f6", props: { width: 2, height: 1 } },
          { id: "text2", type: "text", position: [0, 0], color: "#ffffff", props: { text: "await" } },
          { id: "arrow2", type: "arrow", color: "#94a3b8", props: { start: [1, 0], end: [3, 0] } },
          { id: "box3", type: "rectangle", position: [4, 0], color: "#22c55e", props: { width: 2, height: 1 } },
          { id: "text3", type: "text", position: [4, 0], color: "#ffffff", props: { text: "result" } },
        ],
        animations: [
          { type: "create", target: "box1", duration: 0.5 },
          { type: "write", target: "text1", duration: 0.3 },
          { type: "create", target: "arrow1", duration: 0.3 },
          { type: "create", target: "box2", duration: 0.5 },
          { type: "write", target: "text2", duration: 0.3 },
          { type: "indicate", target: "box2", duration: 0.5 },
          { type: "create", target: "arrow2", duration: 0.3 },
          { type: "create", target: "box3", duration: 0.5 },
          { type: "write", target: "text3", duration: 0.3 },
        ],
        backgroundColor: "#1e1e1e",
      },
      duration: 5,
    },
    {
      id: "step-2",
      text: "Effect.gen uses generator functions. Instead of 'await', we use 'yield*' to unwrap Effects.",
      code: {
        language: "typescript",
        content: `const fetchUser = (id: string) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise(() => fetch(\`/users/\${id}\`))
    const user = yield* Effect.tryPromise(() => response.json())
    return user
  })`,
        highlights: [2, 3],
      },
      visual: {
        name: "EffectGenFlow",
        objects: [
          { id: "gen", type: "rectangle", position: [0, 2], color: "#8b5cf6", props: { width: 4, height: 1 } },
          { id: "genText", type: "text", position: [0, 2], color: "#ffffff", props: { text: "Effect.gen" } },
          { id: "yield1", type: "circle", position: [-2, 0], color: "#f59e0b", props: { radius: 0.5 } },
          { id: "yield1Text", type: "text", position: [-2, -1], color: "#f59e0b", props: { text: "yield*" } },
          { id: "yield2", type: "circle", position: [2, 0], color: "#f59e0b", props: { radius: 0.5 } },
          { id: "yield2Text", type: "text", position: [2, -1], color: "#f59e0b", props: { text: "yield*" } },
          { id: "result", type: "rectangle", position: [0, -2], color: "#22c55e", props: { width: 2, height: 1 } },
          { id: "resultText", type: "text", position: [0, -2], color: "#ffffff", props: { text: "Effect<User>" } },
        ],
        animations: [
          { type: "create", target: "gen", duration: 0.5 },
          { type: "write", target: "genText", duration: 0.3 },
          { type: "create", target: ["yield1", "yield2"], duration: 0.5 },
          { type: "write", target: ["yield1Text", "yield2Text"], duration: 0.3 },
          { type: "indicate", target: ["yield1", "yield2"], duration: 0.5 },
          { type: "create", target: "result", duration: 0.5 },
          { type: "write", target: "resultText", duration: 0.3 },
        ],
        backgroundColor: "#1e1e1e",
      },
      duration: 6,
    },
  ],
}
