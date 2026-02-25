/**
 * ExplainViewer Component
 *
 * Displays step-by-step explanations with optional Manim visualizations.
 */

import { reatomComponent } from "@reatom/react"
import { wrap } from "@/shared/reatom/core"
import { ChevronLeft, ChevronRight, Play, Loader2 } from "lucide-react"
import {
  currentExplanationAtom,
  currentStepAtom,
  currentStepIndexAtom,
  totalStepsAtom,
  isLastStepAtom,
  nextStep,
  prevStep,
  goToStep,
  isRenderingAtom,
  currentStepVideoAtom,
  explainContextSummaryAtom,
  renderStepVisual,
} from "./store"

/**
 * Main explanation viewer
 */
export const ExplainViewer = reatomComponent(() => {
  const explanation = currentExplanationAtom()
  const currentStep = currentStepAtom()
  const stepIndex = currentStepIndexAtom()
  const totalSteps = totalStepsAtom()
  const isLast = isLastStepAtom()
  const isRendering = isRenderingAtom()
  const videoUrl = currentStepVideoAtom()
  const contextSummary = explainContextSummaryAtom()

  if (!explanation) {
    return null
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="text-lg font-semibold">{explanation.title}</h2>
        <p className="text-sm text-gray-400">{explanation.summary}</p>
        {explanation.level && (
          <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-purple-600 rounded">
            {explanation.level}
          </span>
        )}
        {contextSummary && (
          <div className="mt-2 text-xs text-gray-400">
            Context: {contextSummary}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {currentStep && (
          <div className="space-y-4">
            {/* Step text */}
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-200">{currentStep.text}</p>
            </div>

            {/* Code block */}
            {currentStep.code && (
              <div className="rounded-lg overflow-hidden">
                <div className="bg-gray-800 px-3 py-1 text-xs text-gray-400">
                  {currentStep.code.language}
                </div>
                <pre className="bg-gray-950 p-4 overflow-x-auto text-sm">
                  <code>
                    {currentStep.code.content.split("\n").map((line: string, i: number) => (
                      <div
                        key={i}
                        className={
                          currentStep.code?.highlights?.includes(i + 1)
                            ? "bg-yellow-500/20 -mx-4 px-4"
                            : ""
                        }
                      >
                        <span className="text-gray-500 mr-4 select-none">
                          {String(i + 1).padStart(2, " ")}
                        </span>
                        {line}
                      </div>
                    ))}
                  </code>
                </pre>
              </div>
            )}

            {/* Visualization */}
            {currentStep.visual && (
              <div className="rounded-lg overflow-hidden bg-gray-800">
                <div className="px-3 py-1 text-xs text-gray-400 flex items-center justify-between">
                  <span>Visualization: {currentStep.visual.name}</span>
                  {isRendering && (
                    <span className="flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Rendering...
                    </span>
                  )}
                </div>
                <div className="aspect-video bg-gray-950 flex items-center justify-center">
                  {videoUrl ? (
                    <video
                      src={videoUrl}
                      autoPlay
                      loop
                      muted
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={wrap(() => renderStepVisual(currentStep))}
                      disabled={isRendering}
                      className="text-center text-gray-400 hover:text-gray-200 transition disabled:opacity-50"
                    >
                      <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Render visualization</p>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between">
        <button
          onClick={wrap(() => prevStep())}
          disabled={stepIndex === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        {/* Step indicators */}
        <div className="flex gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <button
              key={i}
              onClick={wrap(() => goToStep(i))}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === stepIndex ? "bg-purple-500" : "bg-gray-600 hover:bg-gray-500"
              }`}
            />
          ))}
        </div>

        <button
          onClick={wrap(() => nextStep())}
          disabled={isLast}
          className="flex items-center gap-1 px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}, "ExplainViewer")

/**
 * Compact step indicator for embedding in chat
 */
export const ExplainStepIndicator = reatomComponent(() => {
  const stepIndex = currentStepIndexAtom()
  const totalSteps = totalStepsAtom()

  if (totalSteps === 0) return null

  return (
    <div className="inline-flex items-center gap-2 text-sm text-gray-400">
      <span>
        Step {stepIndex + 1} of {totalSteps}
      </span>
      <div className="flex gap-0.5">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${
              i <= stepIndex ? "bg-purple-500" : "bg-gray-600"
            }`}
          />
        ))}
      </div>
    </div>
  )
}, "ExplainStepIndicator")
