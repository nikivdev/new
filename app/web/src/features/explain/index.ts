/**
 * Explain Mode Feature
 *
 * Provides AI-powered explanations with Manim visualizations.
 */

// Schema types
export type {
  Explanation,
  ExplainStep,
  ManimScene,
  ManimObject,
  ManimAnimation,
  ManimObjectType,
  ManimAnimationType,
} from "./schema"

// Store atoms and actions
export {
  // Mode
  explainModeAtom,
  toggleExplainMode,
  activateExplainMode,
  deactivateExplainMode,
  // Context
  explainContextAtom,
  setExplainContext,
  clearExplainContext,
  explainContextSummaryAtom,
  // Explanation state
  currentExplanationAtom,
  currentStepAtom,
  currentStepIndexAtom,
  totalStepsAtom,
  isLastStepAtom,
  isFirstStepAtom,
  // Navigation
  nextStep,
  prevStep,
  goToStep,
  resetSteps,
  // Loading
  setExplanation,
  clearExplanation,
  parseAndSetExplanation,
  // Rendering
  renderedVideosAtom,
  renderingStepIdAtom,
  renderErrorAtom,
  isRenderingAtom,
  renderStepVisual,
  // AI
  isGeneratingAtom,
  currentTopicAtom,
  generateExplanation,
  // Computed
  currentStepVideoAtom,
  currentStepHasVisualAtom,
  explainSystemPromptAtom,
} from "./store"

// Components
export { ExplainViewer, ExplainStepIndicator } from "./ExplainViewer"

// Manim compiler
export { compileScene, generatePythonFile } from "./manim-compiler"

// API utilities
export {
  parseExplanationFromResponse,
  renderManimScene,
  EXPLAIN_MODE_SYSTEM_PROMPT,
} from "./api"
export type {
  CreateExplanationRequest,
  CreateExplanationResponse,
  RenderSceneRequest,
  RenderSceneResponse,
} from "./api"
