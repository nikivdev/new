import { action, atom, computed } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"
import type { SerializedCanvasImage, SerializedCanvasRecord } from "@/lib/canvas/types"
import {
  createCanvasBox,
  deleteCanvasBox,
  generateCanvasBoxImage,
  updateCanvasBox,
} from "@/lib/canvas/client"
import type { CanvasBox } from "./types"
import { CanvasBoard } from "./CanvasBoard"
import { CanvasToolbar } from "./CanvasToolbar"
import { PromptPanel } from "./PromptPanel"

export type CanvasExperienceProps = {
  initialCanvas: SerializedCanvasRecord
  initialImages: SerializedCanvasImage[]
}

const toBox = (image: SerializedCanvasImage): CanvasBox => ({
  ...image,
  isGenerating: false,
})

const canvasRecordAtom = atom<SerializedCanvasRecord | null>(null, "canvasExperienceRecord")
const boxesAtom = atom<CanvasBox[]>([], "canvasExperienceBoxes")
const selectedBoxIdAtom = atom<string | null>(null, "canvasExperienceSelectedBoxId")
const pendingCountAtom = atom(0, "canvasExperiencePendingCount")
const bannerAtom = atom<string | null>(null, "canvasExperienceBanner")
const promptSaveTimeoutAtom = atom<ReturnType<typeof setTimeout> | null>(null, "canvasExperiencePromptSave")

const isPendingAtom = computed(() => pendingCountAtom() > 0, "canvasExperienceIsPending")
const selectedBoxAtom = computed(
  () => boxesAtom().find((box) => box.id === selectedBoxIdAtom()) ?? null,
  "canvasExperienceSelectedBox",
)

const updateBoxState = action((ctx, id: string, updater: (box: CanvasBox) => CanvasBox) => {
  boxesAtom.set((prev) => prev.map((box) => (box.id === id ? updater(box) : box)))
}, "canvasExperienceUpdateBoxState")

const handleRectChange = action(
  (ctx, id: string, rect: { position: CanvasBox["position"]; size: { width: number; height: number } }) => {
    updateBoxState(id, (box) => ({
      ...box,
      position: rect.position,
      width: rect.size.width,
      height: rect.size.height,
    }))
  },
  "canvasExperienceRectChange",
)

const handleRectCommit = action(async (ctx, id: string, rect: { position: CanvasBox["position"]; size: { width: number; height: number } }) => {
  pendingCountAtom.set((prev) => prev + 1)
  try {
    const image = await updateCanvasBox(id, {
      position: rect.position,
      size: rect.size,
    })
    updateBoxState(id, () => toBox(image))
  } catch {
    bannerAtom.set("Failed to save position")
  } finally {
    pendingCountAtom.set((prev) => Math.max(0, prev - 1))
  }
}, "canvasExperienceRectCommit")

const schedulePromptSave = action((ctx, id: string, prompt: string) => {
  const existing = promptSaveTimeoutAtom()
  if (existing) {
    clearTimeout(existing)
  }
  const timeout = setTimeout(() => {
    pendingCountAtom.set((prev) => prev + 1)
    updateCanvasBox(id, { prompt })
      .then((image) => {
        if (image) {
          updateBoxState(id, () => toBox(image))
        }
      })
      .catch(() => {
        bannerAtom.set("Failed to save prompt")
      })
      .finally(() => {
        pendingCountAtom.set((prev) => Math.max(0, prev - 1))
      })
  }, 600)
  promptSaveTimeoutAtom.set(timeout)
}, "canvasExperienceSchedulePrompt")

export const CanvasExperience = reatomComponent(({ initialCanvas, initialImages }: CanvasExperienceProps) => {
  const canvas = canvasRecordAtom()
  const boxes = boxesAtom()
  const selectedBoxId = selectedBoxIdAtom()
  const selectedBox = selectedBoxAtom()
  const isPending = isPendingAtom()
  const banner = bannerAtom()

  if (!canvas) {
    canvasRecordAtom.set(initialCanvas)
    boxesAtom.set(initialImages.map(toBox))
    selectedBoxIdAtom.set(initialImages[0]?.id ?? null)
  }

  if (!selectedBoxId && boxes[0]) {
    selectedBoxIdAtom.set(boxes[0].id)
  }

  const handleAddBox = () => {
    const reference = boxes[boxes.length - 1]
    const fallbackPosition = reference
      ? { x: reference.position.x + reference.width + 48, y: reference.position.y }
      : { x: 0, y: 0 }

    pendingCountAtom.set((prev) => prev + 1)
    createCanvasBox({
      canvasId: initialCanvas.id,
      position: fallbackPosition,
    })
      .then((image) => {
        const newBox = toBox(image)
        boxesAtom.set((prev) => [...prev, newBox])
        selectedBoxIdAtom.set(newBox.id)
      })
      .catch(() => {
        bannerAtom.set("Failed to add box")
      })
      .finally(() => {
        pendingCountAtom.set((prev) => Math.max(0, prev - 1))
      })
  }

  const handleDuplicateBox = () => {
    if (!selectedBox) return
    const position = {
      x: selectedBox.position.x + 40,
      y: selectedBox.position.y + 40,
    }

    pendingCountAtom.set((prev) => prev + 1)
    createCanvasBox({
      canvasId: initialCanvas.id,
      name: `${selectedBox.name} Copy`,
      prompt: selectedBox.prompt,
      position,
      size: { width: selectedBox.width, height: selectedBox.height },
      modelId: selectedBox.modelId,
      styleId: selectedBox.styleId,
    })
      .then((image) => {
        const newBox = toBox(image)
        boxesAtom.set((prev) => [...prev, newBox])
        selectedBoxIdAtom.set(newBox.id)
      })
      .catch(() => {
        bannerAtom.set("Failed to duplicate box")
      })
      .finally(() => {
        pendingCountAtom.set((prev) => Math.max(0, prev - 1))
      })
  }

  const handleDeleteBox = () => {
    if (!selectedBoxId) return
    if (boxes.length === 1) {
      bannerAtom.set("Keep at least one box on the canvas.")
      return
    }

    pendingCountAtom.set((prev) => prev + 1)
    deleteCanvasBox(selectedBoxId)
      .then(() => {
        boxesAtom.set((prev) => {
          const filtered = prev.filter((box) => box.id !== selectedBoxId)
          selectedBoxIdAtom.set(filtered[0]?.id ?? null)
          return filtered
        })
      })
      .catch(() => {
        bannerAtom.set("Failed to delete box")
      })
      .finally(() => {
        pendingCountAtom.set((prev) => Math.max(0, prev - 1))
      })
  }

  const handlePromptChange = (prompt: string) => {
    if (!selectedBoxId) return
    updateBoxState(selectedBoxId, (box) => ({ ...box, prompt }))
    schedulePromptSave(selectedBoxId, prompt)
  }

  const handleModelChange = (modelId: string) => {
    if (!selectedBoxId) return
    updateBoxState(selectedBoxId, (box) => ({ ...box, modelId }))
    pendingCountAtom.set((prev) => prev + 1)
    updateCanvasBox(selectedBoxId, { modelId })
      .catch(() => {
        bannerAtom.set("Failed to update model")
      })
      .finally(() => {
        pendingCountAtom.set((prev) => Math.max(0, prev - 1))
      })
  }

  const handleStyleChange = (styleId: string) => {
    if (!selectedBoxId) return
    updateBoxState(selectedBoxId, (box) => ({ ...box, styleId }))
    pendingCountAtom.set((prev) => prev + 1)
    updateCanvasBox(selectedBoxId, { styleId })
      .catch(() => {
        bannerAtom.set("Failed to update style")
      })
      .finally(() => {
        pendingCountAtom.set((prev) => Math.max(0, prev - 1))
      })
  }

  const handleGenerate = () => {
    if (!selectedBoxId) {
      bannerAtom.set("Select a box before generating.")
      return
    }

    const target = boxes.find((box) => box.id === selectedBoxId)
    if (!target) return

    if (!target.prompt.trim()) {
      bannerAtom.set("Add a prompt first.")
      return
    }

    updateBoxState(selectedBoxId, (box) => ({ ...box, isGenerating: true }))

    pendingCountAtom.set((prev) => prev + 1)
    generateCanvasBoxImage({
      imageId: selectedBoxId,
      prompt: target.prompt,
      modelId: target.modelId,
    })
      .then((image) => {
        boxesAtom.set((prev) =>
          prev.map((box) =>
            box.id === selectedBoxId ? { ...toBox(image), isGenerating: false } : box,
          ),
        )
      })
      .catch(() => {
        updateBoxState(selectedBoxId, (box) => ({ ...box, isGenerating: false }))
        bannerAtom.set("Image generation failed")
      })
      .finally(() => {
        pendingCountAtom.set((prev) => Math.max(0, prev - 1))
      })
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {banner ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          {banner}
        </div>
      ) : null}
      <div className="relative flex-1">
        <CanvasBoard
          boxes={boxes}
          className="h-full"
          onRectChange={handleRectChange}
          onRectCommit={handleRectCommit}
          onSelect={(id) => selectedBoxIdAtom.set(id)}
          selectedBoxId={selectedBoxId}
        />
        <div className="pointer-events-none absolute left-6 top-6">
          <CanvasToolbar
            canDelete={boxes.length > 1 && Boolean(selectedBoxId)}
            canDuplicate={Boolean(selectedBoxId)}
            disabled={isPending}
            onAdd={handleAddBox}
            onDelete={handleDeleteBox}
            onDuplicate={handleDuplicateBox}
          />
        </div>
      </div>
      <PromptPanel
        box={selectedBox}
        defaultModel={canvas?.defaultModel ?? initialCanvas.defaultModel}
        isGenerating={selectedBox?.isGenerating}
        onGenerate={handleGenerate}
        onModelChange={handleModelChange}
        onPromptChange={handlePromptChange}
        onStyleChange={handleStyleChange}
      />
    </div>
  )
})
