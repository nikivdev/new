/**
 * Explain Mode Store
 *
 * Reatom atoms for managing explain mode state.
 */

import { atom, action, reatomBoolean, computed, wrap } from "@/shared/reatom/core"
import type { Explanation, ExplainStep } from "./schema"
import { generatePythonFile } from "./manim-compiler"
import { parseExplanationFromResponse, EXPLAIN_MODE_SYSTEM_PROMPT } from "./api"
import { streamSseText } from "@/shared/reatom/streaming"

export type ExplainContextEntry = {
  name: string
  path: string
  isDir: boolean
}

export type ExplainContext =
  | {
      kind: "file"
      path: string
      content: string
      truncated?: boolean
    }
  | {
      kind: "dir"
      path: string
      entries: ExplainContextEntry[]
      truncated?: boolean
    }

// ============================================
// Mode State
// ============================================

/** Whether explain mode is active */
export const explainModeAtom = reatomBoolean(false, "explainMode")

/** Toggle explain mode (turns off other modes) */
export const toggleExplainMode = action(() => {
  explainModeAtom.toggle()
}, "toggleExplainMode")

/** Activate explain mode exclusively */
export const activateExplainMode = action(() => {
  explainModeAtom.set(true)
}, "activateExplainMode")

/** Deactivate explain mode */
export const deactivateExplainMode = action(() => {
  explainModeAtom.set(false)
}, "deactivateExplainMode")

// ============================================
// Explain Context
// ============================================

export const explainContextAtom = atom<ExplainContext | null>(
  null,
  "explain/context",
)

export const setExplainContext = action((context: ExplainContext | null) => {
  explainContextAtom.set(context)
}, "explain/setContext")

export const clearExplainContext = action(() => {
  explainContextAtom.set(null)
}, "explain/clearContext")

const formatExplainContextForPrompt = (context: ExplainContext) => {
  const maxChars = 8000
  if (context.kind === "file") {
    const content = context.content.slice(0, maxChars)
    const truncated = context.content.length > maxChars || context.truncated
    const suffix = truncated ? "\n\n[Truncated]" : ""
    return `Connected file: ${context.path}\n\n${content}${suffix}`
  }
  const entries = context.entries
    .slice(0, 100)
    .map((entry) => `${entry.isDir ? "dir" : "file"}: ${entry.name}`)
    .join("\n")
  const truncated =
    context.entries.length > 100 || context.truncated
      ? "\n\n[Truncated]"
      : ""
  return `Connected folder: ${context.path}\n\n${entries}${truncated}`
}

export const explainContextSummaryAtom = computed(() => {
  const context = explainContextAtom()
  if (!context) return null
  if (context.kind === "file") {
    return `File: ${context.path}`
  }
  const count = context.entries.length
  return `Folder: ${context.path} (${count} item${count === 1 ? "" : "s"})`
}, "explain/contextSummary")

// ============================================
// Explanation State
// ============================================

/** Current explanation being displayed */
export const currentExplanationAtom = atom<Explanation | null>(
  null,
  "explain/currentExplanation",
)

/** Current step index */
export const currentStepIndexAtom = atom(0, "explain/currentStepIndex")

/** Current step (computed) */
export const currentStepAtom = computed((): ExplainStep | null => {
  const explanation = currentExplanationAtom()
  const index = currentStepIndexAtom()
  return explanation?.steps[index] ?? null
}, "explain/currentStep")

/** Total steps count */
export const totalStepsAtom = computed(() => {
  const explanation = currentExplanationAtom()
  return explanation?.steps.length ?? 0
}, "explain/totalSteps")

/** Whether we're at the last step */
export const isLastStepAtom = computed(() => {
  const index = currentStepIndexAtom()
  const total = totalStepsAtom()
  return index >= total - 1
}, "explain/isLastStep")

/** Whether we're at the first step */
export const isFirstStepAtom = computed(() => {
  return currentStepIndexAtom() === 0
}, "explain/isFirstStep")

// ============================================
// Navigation Actions
// ============================================

/** Go to next step */
export const nextStep = action(() => {
  const current = currentStepIndexAtom()
  const total = totalStepsAtom()
  if (current < total - 1) {
    currentStepIndexAtom.set(current + 1)
  }
}, "explain/nextStep")

/** Go to previous step */
export const prevStep = action(() => {
  const current = currentStepIndexAtom()
  if (current > 0) {
    currentStepIndexAtom.set(current - 1)
  }
}, "explain/prevStep")

/** Go to specific step */
export const goToStep = action((index: number) => {
  const total = totalStepsAtom()
  if (index >= 0 && index < total) {
    currentStepIndexAtom.set(index)
  }
}, "explain/goToStep")

/** Reset to first step */
export const resetSteps = action(() => {
  currentStepIndexAtom.set(0)
}, "explain/resetSteps")

// ============================================
// Explanation Loading
// ============================================

/** Set a new explanation */
export const setExplanation = action((explanation: Explanation) => {
  currentExplanationAtom.set(explanation)
  currentStepIndexAtom.set(0)
  console.log(`[Explain] Loaded: "${explanation.title}" with ${explanation.steps.length} steps`)
}, "explain/setExplanation")

/** Clear the current explanation */
export const clearExplanation = action(() => {
  currentExplanationAtom.set(null)
  currentStepIndexAtom.set(0)
}, "explain/clearExplanation")

/** Parse explanation from AI response text */
export const parseAndSetExplanation = action((responseText: string) => {
  const explanation = parseExplanationFromResponse(responseText)
  if (explanation) {
    setExplanation(explanation)
    return true
  }
  return false
}, "explain/parseAndSetExplanation")

// ============================================
// Rendering State
// ============================================

/** Rendered video URLs by step ID */
export const renderedVideosAtom = atom<Record<string, string>>(
  {},
  "explain/renderedVideos",
)

/** Currently rendering step ID */
export const renderingStepIdAtom = atom<string | null>(
  null,
  "explain/renderingStepId",
)

/** Render error if any */
export const renderErrorAtom = atom<string | null>(null, "explain/renderError")

/** Whether any render is in progress */
export const isRenderingAtom = computed(
  () => renderingStepIdAtom() !== null,
  "explain/isRendering",
)

/**
 * Render a Manim scene for a step
 */
export const renderStepVisual = action(async (step: ExplainStep) => {
  if (!step.visual) {
    throw new Error("Step has no visual")
  }

  wrap(() => {
    renderingStepIdAtom.set(step.id)
    renderErrorAtom.set(null)
  })

  try {
    console.log(`[Explain] Rendering visual for step: ${step.id}`)

    // Generate Python code
    const pythonCode = generatePythonFile(step.visual)
    console.log(`[Explain] Generated ${pythonCode.length} chars of Python code`)

    // Call render API
    const response = await fetch("/api/explain/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scene: step.visual,
        format: "gif",
        quality: "medium",
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Render failed: ${text}`)
    }

    const result = await response.json() as { success: boolean; url?: string; path?: string; pythonCode?: string }

    if (!result.success) {
      throw new Error("Render was not successful")
    }

    console.log(`[Explain] Render complete for step: ${step.id}`)

    // Store the URL
    const url =
      result.url ??
      (result.path
        ? `file://${result.path}`
        : `data:text/plain;base64,${btoa(result.pythonCode ?? "")}`)
    wrap(() => {
      const videos = renderedVideosAtom()
      renderedVideosAtom.set({ ...videos, [step.id]: url })
      renderingStepIdAtom.set(null)
    })

    return url
  } catch (error) {
    wrap(() => {
      renderErrorAtom.set(error instanceof Error ? error.message : String(error))
      renderingStepIdAtom.set(null)
    })
    throw error
  }
}, "explain/renderStepVisual")

// ============================================
// AI Integration
// ============================================

/** Whether AI is generating an explanation */
export const isGeneratingAtom = reatomBoolean(false, "explain/isGenerating")

/** Topic currently being explained */
export const currentTopicAtom = atom<string | null>(null, "explain/currentTopic")

const explainVisualSystemPrompt = `${EXPLAIN_MODE_SYSTEM_PROMPT}

You will be given an explanation JSON. Return the same JSON but ensure every step includes a "visual" block.
- Preserve existing titles, summaries, text, code, and step ids.
- Only add or fill missing "visual" fields.
- Use only the allowed object and animation types.
- Output only a single \`\`\`explain\`\`\` JSON block, no extra text.
`.trim()

const mergeVisuals = (base: Explanation, enriched: Explanation) => {
  const visualsById = new Map(
    enriched.steps
      .filter((step) => step.visual)
      .map((step) => [step.id, step.visual] as const),
  )
  return {
    ...base,
    steps: base.steps.map((step) =>
      step.visual ? step : { ...step, visual: visualsById.get(step.id) },
    ),
  }
}

const ensureVisuals = async (explanation: Explanation) => {
  const needsVisuals = explanation.steps.some((step) => !step.visual)
  if (!needsVisuals) {
    return explanation
  }

  const messages = [
    { role: "system" as const, content: explainVisualSystemPrompt },
    {
      role: "user" as const,
      content: `Add visuals to this explanation JSON:\\n\\n\`\`\`json\\n${JSON.stringify(explanation)}\\n\`\`\``,
    },
  ]

  try {
    const response = await fetch("/api/chat/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    })
    if (!response.ok) {
      return explanation
    }
    const streamFlag = response.headers.get("X-Stream")
    const contentType = response.headers.get("content-type") ?? ""
    const isSse =
      streamFlag === "sse" || contentType.includes("text/event-stream")
    const text = isSse
      ? (await streamSseText({ response, timeoutMs: 120000 })).text
      : await response.text()
    const enriched = parseExplanationFromResponse(text)
    if (!enriched) {
      return explanation
    }
    return mergeVisuals(explanation, enriched)
  } catch {
    return explanation
  }
}

/**
 * Request AI to generate an explanation
 */
export const generateExplanation = action(async (topic: string) => {
  wrap(() => {
    isGeneratingAtom.set(true)
    currentTopicAtom.set(topic)
  })

  const buildFallbackExplanation = (raw: string) => {
    const cleaned = raw.trim()
    const titleMatch = topic.match(/code from\s+([^:\n]+)/i)
    const title = titleMatch?.[1]
      ? `Explain: ${titleMatch[1].trim()}`
      : topic.length <= 80
        ? `Explain: ${topic.trim()}`
        : 'Explanation'
    const summarySource =
      cleaned.split("\n").find((line) => line.trim().length > 0) ??
      `Explanation for ${title}`
    const summary = summarySource.slice(0, 240)
    const paragraphs = cleaned
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
    const stepsText = paragraphs.length > 0 ? paragraphs : [summary]
    const steps = stepsText.slice(0, 6).map((text, index) => ({
      id: `step-${index + 1}`,
      text,
    }))
    return {
      title,
      summary,
      level: "beginner" as const,
      steps,
    }
  }

  try {
    console.log(`[Explain] Generating explanation for: "${topic}"`)

    // Build the request
    const context = explainContextAtom()
    const contextBlock = context ? `\n\nContext:\n${formatExplainContextForPrompt(context)}` : ""
    const messages = [
      { role: "system" as const, content: EXPLAIN_MODE_SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: `Please explain: ${topic}${contextBlock}`,
      },
    ]

    const guestBody = JSON.stringify({ messages })

    let response = await fetch("/api/chat/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: guestBody,
    })

    if (!response.ok) {
      const text = await response.text()
      console.warn("[Explain] AI request failed", text)
      const fallback = buildFallbackExplanation(
        `AI request failed (${response.status}). ${text}`,
      )
      wrap(() => {
        setExplanation(fallback)
        isGeneratingAtom.set(false)
      })
      return fallback
    }

    const streamFlag = response.headers.get("X-Stream")
    const contentType = response.headers.get("content-type") ?? ""
    const isSse =
      streamFlag === "sse" || contentType.includes("text/event-stream")

    // Parse response
    const text = isSse
      ? (await streamSseText({ response, timeoutMs: 120000 })).text
      : await response.text()
    console.log(`[Explain] Received ${text.length} chars from AI`)

    // Try to parse explanation
    let explanation =
      parseExplanationFromResponse(text) ?? buildFallbackExplanation(text)
    explanation = await ensureVisuals(explanation)

    console.log(`[Explain] Parsed: "${explanation.title}" with ${explanation.steps.length} steps`)

    wrap(() => {
      setExplanation(explanation)
      isGeneratingAtom.set(false)
    })

    return explanation
  } catch (error) {
    const fallback = buildFallbackExplanation(
      `AI request failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    wrap(() => {
      setExplanation(fallback)
      isGeneratingAtom.set(false)
    })
    return fallback
  }
}, "explain/generateExplanation")

// ============================================
// Derived/Computed State
// ============================================

/** Get video URL for current step */
export const currentStepVideoAtom = computed(() => {
  const step = currentStepAtom()
  if (!step) return null
  const videos = renderedVideosAtom()
  return videos[step.id] ?? null
}, "explain/currentStepVideo")

/** Whether current step has a visual */
export const currentStepHasVisualAtom = computed(() => {
  const step = currentStepAtom()
  return step?.visual !== undefined
}, "explain/currentStepHasVisual")

/** System prompt for explain mode */
export const explainSystemPromptAtom = computed(
  () => EXPLAIN_MODE_SYSTEM_PROMPT,
  "explain/systemPrompt",
)
