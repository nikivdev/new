import { AnimatePresence, motion } from "framer-motion"
import type {
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
} from "react"
import { action, atom, effect } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"

import { CANVAS_CONFIG, type CanvasRect } from "../config"
import {
  addBox,
  canvasBoxesAtom,
  canvasSelectedBoxIdAtom,
  deleteBox,
  setSelectedBoxId,
  updateBoxData,
  updateBoxRect,
  type CanvasBox,
} from "../store/canvasStore"
import { GitBranch, Pencil, Trash2, Type } from "lucide-react"

const normaliseRect = (rect: CanvasRect): CanvasRect => ({
  x: Math.round(rect.x),
  y: Math.round(rect.y),
  width: Math.round(rect.width),
  height: Math.round(rect.height),
})

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const MIN_VIEWPORT_SCALE = 0.4
const MAX_VIEWPORT_SCALE = 3
const ZOOM_SENSITIVITY = 0.0012

type CanvasControls = {
  undo: () => void
  redo: () => void
  reset: () => void
  addBox: () => void
  deleteSelected: () => void
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
}

type CanvasProps = {
  generatingBoxIds?: string[]
  error?: string | null
  onControlsChange?: (controls: CanvasControls) => void
  onBranchFrom?: (box: CanvasBox) => void
  onRectCommit?: (boxId: string, rect: CanvasRect) => void
  onEditBox?: (box: CanvasBox) => void
  editingBoxId?: string | null
}

const viewportAtom = atom({ x: 0, y: 0, scale: 1 }, "canvasViewport")
const contextMenuBoxIdAtom = atom<string | null>(null, "canvasContextMenuBoxId")
const hoveredBoxIdAtom = atom<string | null>(null, "canvasHoveredBoxId")
const canvasElementAtom = atom<HTMLDivElement | null>(null, "canvasElement")
const previousBoxCountAtom = atom(0, "canvasPrevBoxCount")
const controlsCallbackAtom = atom<((controls: CanvasControls) => void) | null>(null, "canvasControlsCb")

const centerOnBox = action((ctx, box: CanvasBox) => {
  const element = canvasElementAtom()
  if (!element) {
    return
  }
  const rect = element.getBoundingClientRect()
  viewportAtom.set((prev) => {
    const scale = prev.scale
    const boxCenterX = box.rect.x + box.rect.width / 2
    const boxCenterY = box.rect.y + box.rect.height / 2
    return {
      ...prev,
      x: rect.width / 2 - boxCenterX * scale,
      y: rect.height / 2 - boxCenterY * scale,
    }
  })
}, "canvasCenterOnBox")

effect(() => {
  const element = canvasElementAtom()
  const boxes = canvasBoxesAtom()
  const previousLength = previousBoxCountAtom()

  if (!element || boxes.length === 0) {
    previousBoxCountAtom.set(0)
    return
  }

  if (previousLength === 0) {
    centerOnBox(boxes[0])
  } else if (boxes.length > previousLength) {
    centerOnBox(boxes[boxes.length - 1])
  }

  previousBoxCountAtom.set(boxes.length)
}, "canvasAutoCenter")

effect(() => {
  const callback = controlsCallbackAtom()
  if (!callback) {
    return
  }
  const boxes = canvasBoxesAtom()
  const selectedBoxId = canvasSelectedBoxIdAtom()

  callback({
    undo: () => undefined,
    redo: () => undefined,
    reset: () => {
      const target = boxes.find((box) => box.id === selectedBoxId) ?? boxes[0] ?? null
      if (target) {
        centerOnBox(target)
      } else {
        viewportAtom.set((prev) => ({ ...prev, x: 0, y: 0 }))
      }
    },
    addBox: () => addBox(),
    deleteSelected: () => {
      if (!selectedBoxId) return
      deleteBox(selectedBoxId)
    },
    canUndo: false,
    canRedo: false,
    hasSelection: Boolean(selectedBoxId),
  })
}, "canvasControls")

const Canvas = reatomComponent(({
  generatingBoxIds = [],
  error,
  onControlsChange,
  onBranchFrom,
  onRectCommit,
  onEditBox,
  editingBoxId = null,
}: CanvasProps) => {
  const boxes = canvasBoxesAtom()
  const selectedBoxId = canvasSelectedBoxIdAtom()
  const viewport = viewportAtom()
  const contextMenuBoxId = contextMenuBoxIdAtom()

  controlsCallbackAtom.set(onControlsChange ?? null)

  const statusMessage = error
    ? error
    : "Enter a prompt below to create an image."

  const handleCanvasPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement
    if (target.closest('[data-canvas-box="true"]')) {
      contextMenuBoxIdAtom.set(null)
      return
    }

    event.preventDefault()
    const element = event.currentTarget
    const pointerId = event.pointerId
    const startPointer = { x: event.clientX, y: event.clientY }
    const startOffset = { x: viewport.x, y: viewport.y }

    setSelectedBoxId(null)
    contextMenuBoxIdAtom.set(null)

    if (element.setPointerCapture) {
      try {
        element.setPointerCapture(pointerId)
      } catch {
        // ignore capture errors
      }
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      ev.preventDefault()
      const dx = ev.clientX - startPointer.x
      const dy = ev.clientY - startPointer.y
      viewportAtom.set((prev) => ({
        ...prev,
        x: startOffset.x + dx,
        y: startOffset.y + dy,
      }))
    }

    const finish = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
      if (element.releasePointerCapture) {
        try {
          element.releasePointerCapture(pointerId)
        } catch {
          // ignore
        }
      }
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", finish)
  }

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const element = canvasElementAtom()
    if (!element) {
      return
    }
    event.preventDefault()
    event.stopPropagation()

    const rect = element.getBoundingClientRect()
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }

    viewportAtom.set((prev) => {
      const scaleMultiplier = Math.exp(-event.deltaY * ZOOM_SENSITIVITY)
      const nextScale = clamp(
        prev.scale * scaleMultiplier,
        MIN_VIEWPORT_SCALE,
        MAX_VIEWPORT_SCALE,
      )

      if (nextScale === prev.scale) {
        return prev
      }

      const worldX = (point.x - prev.x) / prev.scale
      const worldY = (point.y - prev.y) / prev.scale
      const nextX = point.x - worldX * nextScale
      const nextY = point.y - worldY * nextScale

      return {
        x: nextX,
        y: nextY,
        scale: nextScale,
      }
    })
  }

  const handleDrag = (
    id: string,
    start: CanvasRect,
    dx: number,
    dy: number,
  ) => {
    const nextRect = normaliseRect({
      ...start,
      x: start.x + dx / viewport.scale,
      y: start.y + dy / viewport.scale,
    })
    updateBoxRect(id, () => nextRect)
    return nextRect
  }

  const handleResize = (
    id: string,
    start: CanvasRect,
    handle: ResizeHandle,
    dx: number,
    dy: number,
  ) => {
    const nextRect = calculateResizedRect(
      handle,
      start,
      dx / viewport.scale,
      dy / viewport.scale,
      {
        minWidth: CANVAS_CONFIG.MIN_WIDTH,
        minHeight: CANVAS_CONFIG.MIN_HEIGHT,
        maxWidth: CANVAS_CONFIG.MAX_PIXEL_WIDTH,
        maxHeight: CANVAS_CONFIG.MAX_PIXEL_HEIGHT,
      },
    )
    updateBoxRect(id, () => nextRect)
    return nextRect
  }

  return (
    <div
      ref={(node) => canvasElementAtom.set(node)}
      className="relative h-full w-full overflow-hidden bg-white transition-colors duration-300 dark:bg-neutral-950"
      onPointerDown={handleCanvasPointerDown}
      onWheel={handleWheel}
      style={{ touchAction: "none" }}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {boxes.map((box, index) => (
          <CanvasBoxView
            key={box.id}
            box={box}
            index={index}
            isSelected={box.id === selectedBoxId}
            defaultStatusMessage={statusMessage}
            isGenerating={generatingBoxIds.includes(box.id)}
            onSelect={() => setSelectedBoxId(box.id)}
            onDrag={handleDrag}
            onResize={handleResize}
            onInteractionStart={() => {
              contextMenuBoxIdAtom.set(null)
            }}
            onInteractionEnd={(_, rect) => {
              onRectCommit?.(box.id, rect)
            }}
            contextMenuOpen={contextMenuBoxId === box.id}
            onOpenContextMenu={(boxId) => {
              contextMenuBoxIdAtom.set(boxId)
              setSelectedBoxId(boxId)
            }}
            onCloseContextMenu={() => contextMenuBoxIdAtom.set(null)}
            onDeleteBox={() => deleteBox(box.id)}
            onRenameBox={(newName) => {
              updateBoxData(box.id, (current) => ({
                ...current,
                name: newName,
              }))
            }}
            onBranchFrom={() => onBranchFrom?.(box)}
            onEditBox={() => onEditBox?.(box)}
            layoutActive={editingBoxId === box.id}
          />
        ))}
      </div>
      {boxes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/60">
          No boxes yet. Use the toolbar or prompt to add one.
        </div>
      ) : null}
    </div>
  )
})

export default Canvas

type CanvasBoxProps = {
  box: CanvasBox
  index: number
  isSelected: boolean
  defaultStatusMessage: string
  isGenerating: boolean
  onSelect: () => void
  onDrag: (id: string, start: CanvasRect, dx: number, dy: number) => CanvasRect
  onResize: (
    id: string,
    start: CanvasRect,
    handle: ResizeHandle,
    dx: number,
    dy: number,
  ) => CanvasRect
  onInteractionStart: () => void
  onInteractionEnd?: (type: "move" | "resize", rect: CanvasRect) => void
  contextMenuOpen: boolean
  onOpenContextMenu: (boxId: string) => void
  onCloseContextMenu: () => void
  onDeleteBox: () => void
  onRenameBox: (name: string) => void
  onBranchFrom: () => void
  onEditBox?: () => void
  layoutActive?: boolean
}

const CanvasBoxView = reatomComponent(({
  box,
  index,
  isSelected,
  defaultStatusMessage,
  isGenerating,
  onSelect,
  onDrag,
  onResize,
  onInteractionStart,
  onInteractionEnd,
  contextMenuOpen,
  onOpenContextMenu,
  onCloseContextMenu,
  onDeleteBox,
  onRenameBox,
  onBranchFrom,
  onEditBox,
  layoutActive = false,
}: CanvasBoxProps) => {
  const hoveredBoxId = hoveredBoxIdAtom()
  const isHovering = hoveredBoxId === box.id

  const showOutline = isSelected || isHovering
  const statusText = box.description ?? box.prompt ?? defaultStatusMessage

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }
    event.stopPropagation()
    onSelect()
    onInteractionStart()
    onCloseContextMenu()

    const pointerId = event.pointerId
    const target = event.currentTarget
    const startPointer = { x: event.clientX, y: event.clientY }
    const startRect = { ...box.rect }
    let latestRect = startRect

    if (target.setPointerCapture) {
      try {
        target.setPointerCapture(pointerId)
      } catch {
        // ignore capture errors
      }
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) {
        return
      }
      latestRect = onDrag(
        box.id,
        startRect,
        ev.clientX - startPointer.x,
        ev.clientY - startPointer.y,
      )
    }

    const finish = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) {
        return
      }
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
      if (target.releasePointerCapture) {
        try {
          target.releasePointerCapture(pointerId)
        } catch {
          // ignore
        }
      }
      onInteractionEnd?.("move", latestRect)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", finish, { once: true })
    window.addEventListener("pointercancel", finish, { once: true })
  }

  const startResize = (handle: ResizeHandle, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }
    event.stopPropagation()
    onSelect()
    onInteractionStart()
    onCloseContextMenu()

    const pointerId = event.pointerId
    const target = event.currentTarget
    const startPointer = { x: event.clientX, y: event.clientY }
    const startRect = { ...box.rect }
    let latestRect = startRect

    if (target.setPointerCapture) {
      try {
        target.setPointerCapture(pointerId)
      } catch {
        // ignore capture errors
      }
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) {
        return
      }
      latestRect = onResize(
        box.id,
        startRect,
        handle,
        ev.clientX - startPointer.x,
        ev.clientY - startPointer.y,
      )
    }

    const finish = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) {
        return
      }
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
      if (target.releasePointerCapture) {
        try {
          target.releasePointerCapture(pointerId)
        } catch {
          // ignore
        }
      }
      onInteractionEnd?.("resize", latestRect)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", finish, { once: true })
    window.addEventListener("pointercancel", finish, { once: true })
  }

  return (
    <motion.div
      data-canvas-box="true"
      className="absolute"
      style={{
        width: box.rect.width,
        height: box.rect.height,
        left: box.rect.x,
        top: box.rect.y,
      }}
      onPointerDown={handlePointerDown}
      onContextMenu={(event: ReactMouseEvent<HTMLDivElement>) => {
        event.preventDefault()
        onOpenContextMenu(box.id)
      }}
      onDoubleClick={() => onEditBox?.()}
      onMouseEnter={() => hoveredBoxIdAtom.set(box.id)}
      onMouseLeave={() => hoveredBoxIdAtom.set(null)}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <div
        className={`relative w-full transition-all duration-300 h-full border canvas-box ${
          showOutline
            ? "border-indigo-400 shadow-[0_0_0_1px_rgba(99,102,241,0.3)]"
            : "border-slate-200 dark:border-neutral-800"
        } bg-white text-slate-900 dark:bg-neutral-900/70 dark:text-white`}
      >
        <AnimatePresence>
          {contextMenuOpen ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="absolute -top-12 left-1/2 z-30 flex -translate-x-1/2 flex-col gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-lg dark:border-white/10 dark:bg-neutral-950/95 dark:text-white"
              onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                event.stopPropagation()
              }}
            >
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onBranchFrom()
                    onCloseContextMenu()
                  }}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-900 transition hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/10"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Branch From
                </button>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onEditBox?.()
                    onCloseContextMenu()
                  }}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-900 transition hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/10"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextName = window.prompt("Rename box", box.name)
                    const trimmed = nextName?.trim()
                    if (!trimmed) {
                      return
                    }
                    onRenameBox(trimmed)
                    onCloseContextMenu()
                  }}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-900 transition hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/10"
                >
                  <Type className="h-3.5 w-3.5" />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteBox()
                    onCloseContextMenu()
                  }}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-red-500 transition hover:bg-red-50 dark:text-red-200 dark:hover:bg-red-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div
          className={`absolute left-3 top-3 flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium uppercase tracking-wide transition-all duration-300 ${
            isSelected
              ? "bg-indigo-500/90 text-white"
              : "bg-black/50 text-white/70"
          }`}
        >
          {box.branchParentId ? <GitBranch className="h-3 w-3" /> : null}
          <span>{box.name || `Box ${index + 1}`}</span>
        </div>
        {box.imageUrl ? (
          layoutActive ? (
            <motion.img
              layoutId={`box-image-${box.id}`}
              src={box.imageUrl}
              alt={box.name}
              className="w-full h-full object-cover pointer-events-none"
            />
          ) : (
            <img
              src={box.imageUrl}
              alt={box.name}
              className="w-full h-full object-cover pointer-events-none"
            />
          )
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-4 text-white/70 text-sm">
            {statusText}
            {isGenerating ? (
              <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            ) : null}
          </div>
        )}

        {showOutline ? (
          <div className="absolute bottom-2 right-3 text-[11px] text-white/80">
            {Math.round(box.rect.width)}×{Math.round(box.rect.height)}
          </div>
        ) : null}

        {showOutline ? (
          <>
            <EdgeHandle
              position="top"
              onPointerDown={(event) => startResize("n", event)}
            />
            <EdgeHandle
              position="bottom"
              onPointerDown={(event) => startResize("s", event)}
            />
            <EdgeHandle
              position="left"
              onPointerDown={(event) => startResize("w", event)}
            />
            <EdgeHandle
              position="right"
              onPointerDown={(event) => startResize("e", event)}
            />
            <CornerHandle
              position="top-left"
              onPointerDown={(event) => startResize("nw", event)}
            />
            <CornerHandle
              position="top-right"
              onPointerDown={(event) => startResize("ne", event)}
            />
            <CornerHandle
              position="bottom-left"
              onPointerDown={(event) => startResize("sw", event)}
            />
            <CornerHandle
              position="bottom-right"
              onPointerDown={(event) => startResize("se", event)}
            />
          </>
        ) : null}
        {isGenerating ? <div className="absolute inset-0 bg-black/30" /> : null}
      </div>
    </motion.div>
  )
})

type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se"

type EdgeHandleProps = {
  position: "top" | "bottom" | "left" | "right"
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
}

function EdgeHandle({ position, onPointerDown }: EdgeHandleProps) {
  const isVertical = position === "top" || position === "bottom"
  const cursor = isVertical ? "ns-resize" : "ew-resize"
  const translateClass =
    position === "top"
      ? "-translate-y-1/2"
      : position === "bottom"
      ? "translate-y-1/2"
      : position === "left"
      ? "-translate-x-1/2"
      : "translate-x-1/2"

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      onPointerDown={onPointerDown}
      className={`absolute ${translateClass} ${
        isVertical ? "left-0 right-0 h-3" : "top-0 bottom-0 w-3"
      } bg-transparent`}
      style={{ cursor }}
    />
  )
}

type CornerHandleProps = {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right"
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
}

function CornerHandle({ position, onPointerDown }: CornerHandleProps) {
  const cursor =
    position === "top-left" || position === "bottom-right"
      ? "nwse-resize"
      : "nesw-resize"

  const className =
    position === "top-left"
      ? "-top-1 -left-1"
      : position === "top-right"
      ? "-top-1 -right-1"
      : position === "bottom-left"
      ? "-bottom-1 -left-1"
      : "-bottom-1 -right-1"

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      onPointerDown={onPointerDown}
      className={`absolute h-[10px] w-[10px] bg-indigo-400 ${className}`}
      style={{ cursor }}
    />
  )
}

function calculateResizedRect(
  handle: ResizeHandle,
  startRect: CanvasRect,
  dx: number,
  dy: number,
  limits: {
    minWidth: number
    minHeight: number
    maxWidth: number
    maxHeight: number
  },
): CanvasRect {
  let x = startRect.x
  let y = startRect.y
  let width = startRect.width
  let height = startRect.height

  if (handle.includes("e")) {
    width = clamp(width + dx, limits.minWidth, limits.maxWidth)
  }
  if (handle.includes("w")) {
    const updatedWidth = clamp(width - dx, limits.minWidth, limits.maxWidth)
    const delta = width - updatedWidth
    width = updatedWidth
    x += delta
  }
  if (handle.includes("s")) {
    height = clamp(height + dy, limits.minHeight, limits.maxHeight)
  }
  if (handle.includes("n")) {
    const updatedHeight = clamp(height - dy, limits.minHeight, limits.maxHeight)
    const delta = height - updatedHeight
    height = updatedHeight
    y += delta
  }

  return normaliseRect({ x, y, width, height })
}
