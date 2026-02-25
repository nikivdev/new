import { action, atom, computed } from "@/shared/reatom/core"

import type { CanvasRect } from "../config"

type CanvasBox = {
  id: string
  name: string
  prompt: string
  rect: CanvasRect
  imageUrl?: string
  description?: string
  model: "gemini" | "dall-e-3" | "nano-banana"
  styleId?: string
  branchParentId?: string | null
}

type OnboardingStep =
  | "welcome"
  | "add-box"
  | "select-box"
  | "enter-prompt"
  | "generate-image"
  | "resize-box"
  | "complete"

const defaultRect: CanvasRect = {
  x: 0,
  y: 0,
  width: 256,
  height: 256,
}

const BOX_GAP = 24
const BRANCH_VERTICAL_GAP = 32

let idCounter = 0
const newId = () => `canvas-box-${++idCounter}`

const normaliseRect = (rect: CanvasRect): CanvasRect => ({
  x: Math.round(rect.x),
  y: Math.round(rect.y),
  width: Math.round(rect.width),
  height: Math.round(rect.height),
})

type CreateBoxInput = {
  id?: string
  name: string
  prompt?: string
  rect?: CanvasRect
  imageUrl?: string
  description?: string
  model?: "gemini" | "dall-e-3" | "nano-banana"
  styleId?: string
  branchParentId?: string | null
}

const createBox = ({
  id,
  name,
  prompt = "",
  rect = defaultRect,
  imageUrl,
  description,
  model = "gemini",
  styleId = "default",
  branchParentId,
}: CreateBoxInput): CanvasBox => ({
  id: id ?? newId(),
  name,
  prompt,
  rect: normaliseRect(rect),
  imageUrl,
  description,
  model,
  styleId,
  branchParentId: branchParentId ?? null,
})

export const canvasBoxesAtom = atom<CanvasBox[]>([], "canvasBoxes")
export const canvasSelectedBoxIdAtom = atom<string | null>(null, "canvasSelectedBoxId")
export const canvasOnboardingStepAtom = atom<OnboardingStep | null>(null, "canvasOnboardingStep")

export const canvasSelectedBoxAtom = computed(
  () => canvasBoxesAtom().find((box) => box.id === canvasSelectedBoxIdAtom()) ?? null,
  "canvasSelectedBox",
)

export const setBoxes = action(
  (ctx, next: CanvasBox[] | ((prev: CanvasBox[]) => CanvasBox[])) => {
    canvasBoxesAtom.set((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next
      return resolved.map((box) => ({
        ...box,
        rect: normaliseRect(box.rect),
        model: box.model ?? "gemini",
        styleId: box.styleId ?? "default",
        branchParentId: box.branchParentId ?? null,
      }))
    })
  },
  "canvasSetBoxes",
)

export const setSelectedBoxId = action((ctx, id: string | null) => {
  canvasSelectedBoxIdAtom.set(id)
}, "canvasSetSelectedBoxId")

export const addBox = action(
  (
    ctx,
    overrides?: Partial<Omit<CanvasBox, "id" | "name" | "rect">> & {
      rect?: Partial<CanvasRect>
    },
    options?: { select?: boolean },
  ) => {
    let created: CanvasBox | null = null
    canvasBoxesAtom.set((prev) => {
      const name = overrides?.name ?? `Box ${prev.length + 1}`
      const last = prev[prev.length - 1] ?? null
      const branchParent = overrides?.branchParentId
        ? prev.find((box) => box.id === overrides.branchParentId)
        : null
      const branchSiblingCount = branchParent
        ? prev.filter((box) => box.branchParentId === branchParent.id).length
        : 0
      const rect: CanvasRect = {
        x:
          overrides?.rect?.x ??
          (branchParent
            ? branchParent.rect.x
            : last
            ? last.rect.x + last.rect.width + BOX_GAP
            : 0),
        y:
          overrides?.rect?.y ??
          (branchParent
            ? branchParent.rect.y +
              branchParent.rect.height +
              BRANCH_VERTICAL_GAP +
              branchSiblingCount * (branchParent.rect.height + BRANCH_VERTICAL_GAP)
            : last
            ? last.rect.y
            : 0),
        width:
          overrides?.rect?.width ??
          (branchParent ? branchParent.rect.width : defaultRect.width),
        height:
          overrides?.rect?.height ??
          (branchParent ? branchParent.rect.height : defaultRect.height),
      }
      created = createBox({
        id: overrides?.id,
        name,
        prompt: overrides?.prompt ?? "",
        rect,
        imageUrl: overrides?.imageUrl,
        description: overrides?.description,
        model: overrides?.model ?? "gemini",
        styleId: overrides?.styleId ?? "default",
        branchParentId: overrides?.branchParentId ?? null,
      })
      return [...prev, created]
    })

    const shouldSelect = options?.select ?? true
    if (created && shouldSelect) {
      canvasSelectedBoxIdAtom.set(created.id)
    }
    return created
  },
  "canvasAddBox",
)

export const updateBoxRect = action(
  (ctx, id: string, updater: (rect: CanvasRect) => CanvasRect) => {
    canvasBoxesAtom.set((prev) =>
      prev.map((box) =>
        box.id === id
          ? {
              ...box,
              rect: normaliseRect(updater(box.rect)),
            }
          : box,
      ),
    )
  },
  "canvasUpdateBoxRect",
)

export const updateBoxData = action(
  (ctx, id: string, updater: (box: CanvasBox) => CanvasBox) => {
    canvasBoxesAtom.set((prev) =>
      prev.map((box) => {
        if (box.id !== id) {
          return box
        }
        const updated = updater(box)
        return {
          ...updated,
          model: updated.model ?? "gemini",
          rect: normaliseRect(updated.rect),
          styleId: updated.styleId ?? box.styleId ?? "default",
          branchParentId: updated.branchParentId ?? box.branchParentId ?? null,
        }
      }),
    )
  },
  "canvasUpdateBoxData",
)

export const deleteBox = action((ctx, id: string) => {
  canvasBoxesAtom.set((prev) => {
    if (prev.length <= 1) {
      return prev
    }
    const next = prev.filter((box) => box.id !== id)
    if (next.length > 0) {
      canvasSelectedBoxIdAtom.set(next[next.length - 1]?.id ?? null)
    } else {
      canvasSelectedBoxIdAtom.set(null)
    }
    return next
  })
}, "canvasDeleteBox")

export const resetBoxes = action(
  (
    ctx,
    initial: Array<
      Partial<Omit<CanvasBox, "id" | "name" | "rect">> & {
        name?: string
        rect?: Partial<CanvasRect>
        imageUrl?: string
        description?: string
        model?: "gemini" | "dall-e-3" | "nano-banana"
        styleId?: string
      }
    >,
  ) => {
    let counter = 0
    let cursorX = 0
    const next = initial.map((item) => {
      counter += 1
      const rect: CanvasRect = {
        x: item.rect?.x ?? cursorX,
        y: item.rect?.y ?? 0,
        width: item.rect?.width ?? defaultRect.width,
        height: item.rect?.height ?? defaultRect.height,
      }
      const box = createBox({
        id: item.id,
        name: item.name ?? `Box ${counter}`,
        prompt: item.prompt ?? "",
        rect,
        imageUrl: item.imageUrl,
        description: item.description,
        model: item.model ?? "gemini",
        styleId: item.styleId ?? "default",
        branchParentId: item.branchParentId ?? null,
      })
      cursorX = box.rect.x + box.rect.width + BOX_GAP
      return box
    })
    setBoxes(next)
    canvasSelectedBoxIdAtom.set(next[0]?.id ?? null)
  },
  "canvasReset",
)

export const startOnboarding = action(() => {
  canvasOnboardingStepAtom.set("welcome")
}, "canvasStartOnboarding")

export const completeOnboarding = action(() => {
  canvasOnboardingStepAtom.set(null)
}, "canvasCompleteOnboarding")

export type { CanvasBox, OnboardingStep }
