import { action, atom, computed, effect, reatomBoolean } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"

import Canvas from "./components/Canvas"
import Overlay from "./components/Overlay"
import { InpaintingMaskEditor } from "./components/InpaintingMaskEditor"
import {
  addBox,
  canvasBoxesAtom,
  canvasSelectedBoxIdAtom,
  deleteBox,
  resetBoxes,
  setSelectedBoxId,
  startOnboarding,
  updateBoxData,
  type CanvasBox,
} from "./store/canvasStore"
import type {
  SerializedCanvasImage,
  SerializedCanvasRecord,
} from "@/lib/canvas/types"
import { useBilling } from "@/components/BillingProvider"
import {
  createCanvasBox,
  deleteCanvasBox,
  generateCanvasBoxImage,
  inpaintCanvasBoxImage,
  updateCanvasBox,
} from "@/lib/canvas/client"
import type { CanvasRect } from "./config"

const TOKEN_COST = 1

type BladeCanvasExperienceProps = {
  initialCanvas: SerializedCanvasRecord
  initialImages: SerializedCanvasImage[]
}

const getImageDataUrl = (image: SerializedCanvasImage) => {
  if (image.imageUrl) {
    return image.imageUrl
  }
  if (image.imageData) {
    const mime =
      typeof image.metadata?.mimeType === "string" ? image.metadata.mimeType : "image/png"
    return `data:${mime};base64,${image.imageData}`
  }
  return undefined
}

const uiModelFromProvider = (
  modelId: string | null | undefined,
): CanvasBox["model"] => {
  if (!modelId) {
    return "gemini"
  }
  if (modelId.includes("gpt-image") || modelId.includes("dall")) {
    return "dall-e-3"
  }
  if (modelId.includes("nano-banana")) {
    return "nano-banana"
  }
  return "gemini"
}

const GEMINI_MODEL = "gemini-2.5-flash-image-preview"

const providerModelFromUi = (model: CanvasBox["model"]) => {
  switch (model) {
    case "dall-e-3":
      return "gpt-image-1"
    case "nano-banana":
      return "nano-banana"
    default:
      return GEMINI_MODEL
  }
}

const mapImageToBoxInput = (image: SerializedCanvasImage): CanvasBox => ({
  id: image.id,
  name: image.name,
  prompt: image.prompt ?? "",
  rect: {
    x: image.position?.x ?? 0,
    y: image.position?.y ?? 0,
    width: image.width,
    height: image.height,
  },
  imageUrl: getImageDataUrl(image),
  description:
    typeof image.metadata?.description === "string" ? image.metadata.description : undefined,
  model: uiModelFromProvider(image.modelId),
  styleId: image.styleId ?? "default",
  branchParentId: image.branchParentId ?? null,
})

const rectToPosition = (rect: CanvasRect) => ({ x: rect.x, y: rect.y })
const rectToSize = (rect: CanvasRect) => ({ width: rect.width, height: rect.height })

const canvasIdAtom = atom<string | null>(null, "canvasId")
const initialImagesAtom = atom<SerializedCanvasImage[] | null>(null, "canvasInitialImages")
const initializedAtom = reatomBoolean(false, "canvasInitialized")

const promptValueAtom = atom("", "canvasPromptValue")
const errorAtom = atom<string | null>(null, "canvasError")
const generatingBoxIdsAtom = atom<string[]>([], "canvasGeneratingBoxIds")
const editingBoxIdAtom = atom<string | null>(null, "canvasEditingBoxId")
const maskDraftAtom = atom<string | null>(null, "canvasMaskDraft")
const maskCoverageAtom = atom(0, "canvasMaskCoverage")
const isInpaintingAtom = reatomBoolean(false, "canvasIsInpainting")
const inpaintErrorAtom = atom<string | null>(null, "canvasInpaintError")
const inpaintStrengthAtom = atom(0.85, "canvasInpaintStrength")
const promptSaveTimeoutAtom = atom<ReturnType<typeof setTimeout> | null>(null, "canvasPromptSaveTimeout")

const activeBoxAtom = computed(
  () => canvasBoxesAtom().find((box) => box.id === canvasSelectedBoxIdAtom()) ?? null,
  "canvasActiveBox",
)

const editingBoxAtom = computed(() => {
  const editingId = editingBoxIdAtom()
  if (!editingId) return null
  return canvasBoxesAtom().find((box) => box.id === editingId) ?? null
}, "canvasEditingBox")

const promptContextLabelAtom = computed(() => {
  const activeBox = activeBoxAtom()
  const boxes = canvasBoxesAtom()
  if (!activeBox) {
    return null
  }
  if (activeBox.branchParentId) {
    const boxIndex = boxes.findIndex((box) => box.id === activeBox.id) + 1
    const parentIndex = boxes.findIndex((box) => box.id === activeBox.branchParentId) + 1
    return `Box ${boxIndex} Branch of Box ${parentIndex > 0 ? parentIndex : "?"}`
  }
  if (activeBox.name) {
    return activeBox.name
  }
  const boxIndex = boxes.findIndex((box) => box.id === activeBox.id) + 1
  return boxIndex ? `Box ${boxIndex}` : null
}, "canvasPromptContextLabel")

const schedulePromptSave = action((ctx, boxId: string, prompt: string) => {
  const existing = promptSaveTimeoutAtom()
  if (existing) {
    clearTimeout(existing)
  }
  const timeout = setTimeout(() => {
    updateCanvasBox(boxId, { prompt }).catch((err) => {
      console.error("[canvas] failed to persist prompt", err)
      errorAtom.set("Failed to save prompt")
    })
  }, 600)
  promptSaveTimeoutAtom.set(timeout)
}, "canvasSchedulePromptSave")

const syncBoxWithImage = action(
  (ctx, localId: string, image: SerializedCanvasImage) => {
    const mapped = mapImageToBoxInput(image)
    updateBoxData(localId, () => mapped as CanvasBox)
    if (localId !== mapped.id) {
      setSelectedBoxId(canvasSelectedBoxIdAtom() === localId ? mapped.id : canvasSelectedBoxIdAtom())
      generatingBoxIdsAtom.set((prev) => prev.map((id) => (id === localId ? mapped.id : id)))
    }
    return mapped.id
  },
  "canvasSyncBoxWithImage",
)

const persistNewBox = action(async (ctx, box: CanvasBox) => {
  const canvasId = canvasIdAtom()
  if (!canvasId) {
    throw new Error("Missing canvas id")
  }
  const image = await createCanvasBox({
    canvasId,
    name: box.name,
    prompt: box.prompt,
    position: rectToPosition(box.rect),
    size: rectToSize(box.rect),
    modelId: providerModelFromUi(box.model),
    styleId: box.styleId ?? "default",
    branchParentId: box.branchParentId ?? null,
  })
  return syncBoxWithImage(box.id, image)
}, "canvasPersistNewBox")

const handlePromptValueChange = action((ctx, value: string) => {
  promptValueAtom.set(value)
  const selectedBoxId = canvasSelectedBoxIdAtom()
  if (!selectedBoxId) {
    return
  }
  updateBoxData(selectedBoxId, (box) => ({
    ...box,
    prompt: value,
  }))
  schedulePromptSave(selectedBoxId, value)
}, "canvasPromptValueChange")

const handleSelectStyle = action(async (ctx, styleId: string) => {
  const selectedBoxId = canvasSelectedBoxIdAtom()
  if (!selectedBoxId) return
  updateBoxData(selectedBoxId, (box) => ({ ...box, styleId }))
  try {
    await updateCanvasBox(selectedBoxId, { styleId })
  } catch (err) {
    console.error("[canvas] failed to update style", err)
    errorAtom.set("Failed to update style")
  }
}, "canvasSelectStyle")

const handleModelChange = action(async (ctx, modelId: CanvasBox["model"], boxId?: string) => {
  const targetId = boxId ?? canvasSelectedBoxIdAtom()
  if (!targetId) return
  updateBoxData(targetId, (box) => ({ ...box, model: modelId }))
  try {
    await updateCanvasBox(targetId, {
      modelId: providerModelFromUi(modelId),
    })
  } catch (err) {
    console.error("[canvas] failed to update model", err)
    errorAtom.set("Failed to update model")
  }
}, "canvasModelChange")

const handleRectCommit = action((ctx, boxId: string, rect: CanvasRect) => {
  updateCanvasBox(boxId, {
    position: rectToPosition(rect),
    size: rectToSize(rect),
  }).catch((err) => {
    console.error("[canvas] failed to persist rect", err)
    errorAtom.set("Failed to save box position")
  })
}, "canvasRectCommit")

const handleEditPromptChange = action((ctx, boxId: string, value: string) => {
  updateBoxData(boxId, (box) => ({
    ...box,
    prompt: value,
  }))
  schedulePromptSave(boxId, value)
}, "canvasEditPromptChange")

const handleEditSizeChange = action((ctx, boxId: string, dimension: "width" | "height", value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return
  }
  const target = canvasBoxesAtom().find((box) => box.id === boxId)
  const width = dimension === "width" ? value : target?.rect.width ?? value
  const height = dimension === "height" ? value : target?.rect.height ?? value
  updateBoxData(boxId, (box) => ({
    ...box,
    rect: {
      ...box.rect,
      width,
      height,
    },
  }))
  updateCanvasBox(boxId, {
    size: { width, height },
  }).catch((err) => {
    console.error("[canvas] failed to update size", err)
    errorAtom.set("Failed to update size")
  })
}, "canvasEditSizeChange")

const handleAddBox = action(async () => {
  const created = addBox()
  if (!created) {
    return
  }
  try {
    const newId = await persistNewBox(created)
    setSelectedBoxId(newId)
    errorAtom.set(null)
  } catch (err) {
    console.error("[canvas] failed to create box", err)
    deleteBox(created.id)
    errorAtom.set("Failed to add box")
  }
}, "canvasAddBox")

const handleDeleteSelected = action(async () => {
  const selectedBoxId = canvasSelectedBoxIdAtom()
  if (!selectedBoxId) {
    return
  }
  if (canvasBoxesAtom().length <= 1) {
    errorAtom.set("Keep at least one box on the canvas.")
    return
  }
  try {
    await deleteCanvasBox(selectedBoxId)
    deleteBox(selectedBoxId)
    generatingBoxIdsAtom.set((prev) => prev.filter((id) => id !== selectedBoxId))
    errorAtom.set(null)
  } catch (err) {
    console.error("[canvas] failed to delete box", err)
    errorAtom.set("Failed to delete box")
  }
}, "canvasDeleteSelected")

const handleBranchFrom = action(async (ctx, box: CanvasBox) => {
  const boxes = canvasBoxesAtom()
  const parentIndex = boxes.findIndex((candidate) => candidate.id === box.id) + 1
  const branchName = `Box ${boxes.length + 1} Branch of Box ${parentIndex || "?"}`
  const created = addBox(
    {
      name: branchName,
      prompt: box.prompt,
      model: box.model,
      styleId: box.styleId,
      branchParentId: box.id,
    },
    { select: true },
  )
  if (!created) {
    return
  }
  promptValueAtom.set(box.prompt)
  try {
    const newId = await persistNewBox(created)
    setSelectedBoxId(newId)
    errorAtom.set(null)
  } catch (err) {
    console.error("[canvas] failed to branch box", err)
    deleteBox(created.id)
    errorAtom.set("Unable to create a branch box")
  }
}, "canvasBranchFrom")

const handleSubmitPrompt = action(async (ctx, value: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }

  let targetBoxId = canvasSelectedBoxIdAtom() ?? null
  let targetBox = targetBoxId
    ? canvasBoxesAtom().find((candidate) => candidate.id === targetBoxId) ?? null
    : null

  if (!targetBox || !targetBoxId) {
    const created = addBox({ prompt: trimmed }, { select: true })
    if (!created) {
      errorAtom.set("Unable to create a box for this prompt")
      return false
    }
    try {
      targetBoxId = await persistNewBox(created)
      targetBox = { ...created, id: targetBoxId }
      setSelectedBoxId(targetBoxId)
    } catch (err) {
      console.error("[canvas] failed to create prompt box", err)
      deleteBox(created.id)
      errorAtom.set("Unable to create a box for this prompt")
      return false
    }
  }

  const boxId = targetBoxId
  let effectivePrompt = trimmed
  if (targetBox?.branchParentId) {
    const parent = canvasBoxesAtom().find((candidate) => candidate.id === targetBox.branchParentId)
    if (parent) {
      const parentPrompt = parent.prompt.trim()
      if (parentPrompt && !effectivePrompt.startsWith(parentPrompt)) {
        effectivePrompt = [parentPrompt, effectivePrompt]
          .map((item) => item.trim())
          .filter(Boolean)
          .join(" ")
      }
    }
  }

  generatingBoxIdsAtom.set((prev) => (prev.includes(boxId) ? prev : [...prev, boxId]))
  errorAtom.set(null)
  let currentId = boxId
  try {
    const image = await generateCanvasBoxImage({
      imageId: boxId,
      prompt: effectivePrompt,
      modelId: providerModelFromUi(targetBox!.model),
    })
    currentId = syncBoxWithImage(boxId, image)
    promptValueAtom.set(effectivePrompt)
    return true
  } catch (err) {
    console.error("[canvas] generation failed", err)
    const message = err instanceof Error ? err.message : "Unable to generate image"
    errorAtom.set(message)
    return false
  } finally {
    generatingBoxIdsAtom.set((prev) => prev.filter((id) => id !== currentId))
  }
}, "canvasSubmitPrompt")

const handleOpenEdit = action((ctx, box: CanvasBox) => {
  editingBoxIdAtom.set(box.id)
  setSelectedBoxId(box.id)
}, "canvasOpenEdit")

const handleCloseEdit = action(() => {
  editingBoxIdAtom.set(null)
}, "canvasCloseEdit")

const handleMaskDraftChange = action((ctx, mask: string | null, coverageValue: number) => {
  maskDraftAtom.set(mask)
  maskCoverageAtom.set(coverageValue)
}, "canvasMaskDraftChange")

const handleApplyInpaint = action(async () => {
  const editingBox = editingBoxAtom()
  if (!editingBox) {
    return
  }
  const maskDraft = maskDraftAtom()
  if (!maskDraft) {
    inpaintErrorAtom.set("Paint over the area you want to edit first.")
    return
  }
  isInpaintingAtom.set(true)
  inpaintErrorAtom.set(null)
  try {
    const image = await inpaintCanvasBoxImage({
      imageId: editingBox.id,
      mask: maskDraft,
      prompt: editingBox.prompt,
      strength: inpaintStrengthAtom(),
    })
    syncBoxWithImage(editingBox.id, image)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Inpainting failed"
    inpaintErrorAtom.set(message)
  } finally {
    isInpaintingAtom.set(false)
  }
}, "canvasApplyInpaint")

effect(() => {
  const initialImages = initialImagesAtom()
  if (initializedAtom() || !initialImages) {
    return
  }
  resetBoxes(initialImages.map(mapImageToBoxInput))
  initializedAtom.set(true)
}, "canvasInit")

effect(() => {
  const initialized = initializedAtom()
  const boxes = canvasBoxesAtom()
  if (!initialized) return
  if (boxes.length === 0) {
    startOnboarding()
  }
}, "canvasOnboarding")

effect(() => {
  const activeBox = activeBoxAtom()
  if (!activeBox) {
    promptValueAtom.set("")
    return
  }
  promptValueAtom.set((prev) => (prev === activeBox.prompt ? prev : activeBox.prompt))
}, "canvasPromptSync")

effect(() => {
  editingBoxIdAtom()
  const editingBox = editingBoxAtom()
  maskDraftAtom.set(null)
  maskCoverageAtom.set(0)
  if (!editingBox) {
    inpaintErrorAtom.set(null)
  }
}, "canvasMaskReset")

effect(() => {
  const editingId = editingBoxIdAtom()
  if (editingId && !canvasBoxesAtom().find((box) => box.id === editingId)) {
    editingBoxIdAtom.set(null)
  }
}, "canvasEditGuard")

export const BladeCanvasExperience = reatomComponent(({ initialCanvas, initialImages }: BladeCanvasExperienceProps) => {
  canvasIdAtom.set(initialCanvas.id)
  initialImagesAtom.set(initialImages)

  const billing = useBilling()
  const tokenBalance = {
    tokens: Math.max(0, billing.usage?.standard?.remaining ?? billing.remaining ?? 0),
  }

  const boxes = canvasBoxesAtom()
  const activeBox = activeBoxAtom()
  const editingBox = editingBoxAtom()
  const promptValue = promptValueAtom()
  const error = errorAtom()
  const generatingBoxIds = generatingBoxIdsAtom()
  const promptContextLabel = promptContextLabelAtom()
  const editingBoxId = editingBoxIdAtom()
  const maskDraft = maskDraftAtom()
  const maskCoverage = maskCoverageAtom()
  const isInpainting = isInpaintingAtom()
  const inpaintError = inpaintErrorAtom()
  const inpaintStrength = inpaintStrengthAtom()

  const currentBoxName = activeBox?.name ?? null
  const selectedBoxId = canvasSelectedBoxIdAtom()
  const isGenerating = selectedBoxId ? generatingBoxIds.includes(selectedBoxId) : false

  if (editingBox) {
    const imageUrl = editingBox.imageUrl
    return (
      <div className="flex h-screen w-full divide-x divide-white/10 overflow-hidden bg-neutral-950 text-white">
        <div className="relative flex-1 overflow-hidden">
          {imageUrl ? (
            <>
              <div
                className="absolute inset-0 scale-110 transform bg-cover bg-center blur-3xl opacity-50"
                style={{ backgroundImage: `url(${imageUrl})` }}
              />
              <div className="relative z-10 flex h-full w-full items-center justify-center">
                <InpaintingMaskEditor
                  imageUrl={imageUrl}
                  onMaskChange={handleMaskDraftChange}
                />
              </div>
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/60">
              No image generated yet.
            </div>
          )}
        </div>
        <div className="flex w-full max-w-md flex-col gap-6 bg-neutral-900/80 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.4em] text-white/60">Editing</p>
              <h2 className="text-2xl font-semibold">{editingBox.name}</h2>
            </div>
            <button
              type="button"
              onClick={handleCloseEdit}
              className="rounded-full border border-white/20 px-4 py-1 text-sm text-white transition hover:border-white/50"
            >
              Done
            </button>
          </div>
          <div className="space-y-4">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-white/60">Prompt</span>
              <textarea
                className="min-h-[150px] rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none focus:border-white/40"
                value={editingBox.prompt}
                onChange={(event) => handleEditPromptChange(editingBox.id, event.target.value)}
              />
            </label>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-white/50">Mask Coverage</div>
              <div className="text-2xl font-semibold text-white">
                {maskCoverage > 0 ? `${(maskCoverage * 100).toFixed(1)}%` : "No mask"}
              </div>
              <p className="text-xs text-white/60">
                {maskDraft ? "Ready for inpainting" : "Paint the regions to update."}
              </p>
            </div>
            <label className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between text-white/60">
                <span>Inpaint Strength</span>
                <span className="text-white/80">{inpaintStrength.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={inpaintStrength}
                onChange={(event) => inpaintStrengthAtom.set(Number(event.target.value))}
                className="accent-white"
              />
              <span className="text-xs text-white/50">
                Lower values keep more of the original image; higher values apply stronger edits.
              </span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-white/60">Width</span>
                <input
                  type="number"
                  min={64}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/40"
                  value={Math.round(editingBox.rect.width)}
                  onChange={(event) => handleEditSizeChange(editingBox.id, "width", Number(event.target.value))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-white/60">Height</span>
                <input
                  type="number"
                  min={64}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/40"
                  value={Math.round(editingBox.rect.height)}
                  onChange={(event) => handleEditSizeChange(editingBox.id, "height", Number(event.target.value))}
                />
              </label>
            </div>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-white/60">Model</span>
              <select
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/40"
                value={editingBox.model}
                onChange={(event) => handleModelChange(event.target.value as CanvasBox["model"], editingBox.id)}
              >
                <option value="gemini">Gemini</option>
                <option value="dall-e-3">DALL·E 3</option>
                <option value="nano-banana" disabled>
                  Nano Banana (Coming soon)
                </option>
              </select>
            </label>
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
              <span>Style</span>
              <span className="font-semibold">{editingBox.styleId}</span>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleApplyInpaint}
                disabled={isInpainting || !maskDraft}
                className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  maskDraft
                    ? "bg-white text-black hover:bg-white/90 disabled:bg-white/40"
                    : "bg-white/20 text-white/40"
                }`}
              >
                {isInpainting ? "Applying Z-Image…" : "Apply Z-Image Inpainting"}
              </button>
              {inpaintError ? (
                <p className="text-xs text-red-300">{inpaintError}</p>
              ) : (
                <p className="text-xs text-white/50">
                  Use Z-Image Turbo to regenerate only the masked region. Painting is required before running.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 transition-colors duration-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100">
      <Canvas
        generatingBoxIds={generatingBoxIds}
        error={error}
        onBranchFrom={handleBranchFrom}
        onRectCommit={handleRectCommit}
        onEditBox={handleOpenEdit}
        editingBoxId={editingBoxId}
      />
      <Overlay
        value={promptValue}
        onValueChange={handlePromptValueChange}
        onSubmit={handleSubmitPrompt}
        isGenerating={isGenerating}
        error={error}
        contextLabel={promptContextLabel}
        onAddBox={handleAddBox}
        onDeleteSelected={handleDeleteSelected}
        onSelectStyle={handleSelectStyle}
        onSelectModel={handleModelChange}
        tokenBalance={tokenBalance}
        tokenCost={TOKEN_COST}
      />
      {currentBoxName ? (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 text-xs uppercase tracking-wide text-white/50">
          Selected: {currentBoxName}
        </div>
      ) : null}
    </div>
  )
})
