import { Eraser, Paintbrush, RotateCcw } from "lucide-react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { atom, effect, reatomBoolean } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"

type Mode = "brush" | "erase"

type InpaintingMaskEditorProps = {
  imageUrl: string
  disabled?: boolean
  onMaskChange: (maskDataUrl: string | null, coverage: number) => void
}

const DEFAULT_SIZE = 1024
const DEFAULT_BRUSH_PX = 80

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`

const dataCanvasAtom = atom<HTMLCanvasElement | null>(null, "maskDataCanvas")
const previewCanvasAtom = atom<HTMLCanvasElement | null>(null, "maskPreviewCanvas")
const pointerStateAtom = atom(
  { pointerId: null as number | null, lastPoint: null as { x: number; y: number } | null },
  "maskPointerState",
)
const imageSizeAtom = atom<{ width: number; height: number } | null>(null, "maskImageSize")
const brushSizeAtom = atom(DEFAULT_BRUSH_PX, "maskBrushSize")
const modeAtom = atom<Mode>("brush", "maskMode")
const coverageAtom = atom(0, "maskCoverage")
const readyAtom = reatomBoolean(false, "maskReady")
const imageUrlAtom = atom("", "maskImageUrl")
const maskChangeCallbackAtom = atom<InpaintingMaskEditorProps["onMaskChange"] | null>(null, "maskChangeCb")

effect(() => {
  const imageUrl = imageUrlAtom()
  if (!imageUrl) return

  readyAtom.set(false)
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.onload = () => {
    imageSizeAtom.set({
      width: img.naturalWidth || DEFAULT_SIZE,
      height: img.naturalHeight || DEFAULT_SIZE,
    })
    readyAtom.set(true)
    resetMask()
  }
  img.onerror = () => {
    imageSizeAtom.set({ width: DEFAULT_SIZE, height: DEFAULT_SIZE })
    readyAtom.set(true)
    resetMask()
  }
  img.src = imageUrl
}, "maskLoadImage")

const resetMask = () => {
  const dataCtx = dataCanvasAtom()?.getContext("2d")
  const previewCtx = previewCanvasAtom()?.getContext("2d")
  if (dataCtx && previewCtx) {
    dataCtx.clearRect(0, 0, dataCtx.canvas.width, dataCtx.canvas.height)
    previewCtx.clearRect(0, 0, previewCtx.canvas.width, previewCtx.canvas.height)
  }
  coverageAtom.set(0)
  const onMaskChange = maskChangeCallbackAtom()
  onMaskChange?.(null, 0)
}

const emitMask = () => {
  const canvas = dataCanvasAtom()
  if (!canvas) {
    return
  }
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return
  }
  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const totalPixels = width * height
  let paintedPixels = 0
  const data = imageData.data
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 10) {
      paintedPixels += 1
    }
  }
  const ratio = paintedPixels / totalPixels
  coverageAtom.set(ratio)
  const onMaskChange = maskChangeCallbackAtom()
  onMaskChange?.(paintedPixels > 0 ? canvas.toDataURL("image/png") : null, ratio)
}

const drawStroke = (start: { x: number; y: number }, end: { x: number; y: number }) => {
  const dataCtx = dataCanvasAtom()?.getContext("2d")
  const previewCtx = previewCanvasAtom()?.getContext("2d")
  if (!dataCtx || !previewCtx) {
    return
  }

  const brushSize = brushSizeAtom()
  const mode = modeAtom()

  const applyStroke = (
    ctx: CanvasRenderingContext2D,
    strokeStyle: string,
    composite: GlobalCompositeOperation,
  ) => {
    ctx.save()
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.lineWidth = brushSize
    ctx.strokeStyle = strokeStyle
    ctx.globalCompositeOperation = composite
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
    ctx.restore()
  }

  const compositeMode = mode === "erase" ? "destination-out" : "source-over"
  applyStroke(dataCtx, mode === "erase" ? "#000000" : "#ffffff", compositeMode)
  applyStroke(previewCtx, mode === "erase" ? "rgba(0,0,0,1)" : "rgba(239,68,68,0.8)", compositeMode)
}

const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
  const canvas = event.currentTarget
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  }
}

export const InpaintingMaskEditor = reatomComponent(({ imageUrl, disabled, onMaskChange }: InpaintingMaskEditorProps) => {
  const imageSize = imageSizeAtom()
  const brushSize = brushSizeAtom()
  const mode = modeAtom()
  const coverage = coverageAtom()
  const isReady = readyAtom()

  imageUrlAtom.set(imageUrl)
  maskChangeCallbackAtom.set(onMaskChange)

  const canvasSize = imageSize ?? { width: DEFAULT_SIZE, height: DEFAULT_SIZE }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || !isReady) {
      return
    }
    event.preventDefault()
    const canvas = event.currentTarget
    const point = getCanvasPoint(event)
    pointerStateAtom.set({ pointerId: event.pointerId, lastPoint: point })
    canvas.setPointerCapture(event.pointerId)
    drawStroke(point, point)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = pointerStateAtom()
    if (ctx.pointerId === null || ctx.pointerId !== event.pointerId) {
      return
    }
    event.preventDefault()
    const nextPoint = getCanvasPoint(event)
    if (ctx.lastPoint) {
      drawStroke(ctx.lastPoint, nextPoint)
    }
    pointerStateAtom.set({ pointerId: ctx.pointerId, lastPoint: nextPoint })
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = pointerStateAtom()
    if (ctx.pointerId !== event.pointerId) {
      return
    }
    event.preventDefault()
    event.currentTarget.releasePointerCapture(event.pointerId)
    pointerStateAtom.set({ pointerId: null, lastPoint: null })
    emitMask()
  }

  const dimensionStyle = {
    width: "100%",
    height: "100%",
  } as const

  return (
    <div className="relative flex h-full w-full items-center justify-center p-4">
      <div className="relative max-h-full max-w-full">
        <img
          src={imageUrl}
          alt="Editable"
          className="max-h-[70vh] max-w-[70vw] rounded-3xl shadow-2xl"
          style={{ display: isReady ? "block" : "none" }}
        />
        <canvas
          ref={(node) => previewCanvasAtom.set(node)}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute left-0 top-0 h-full w-full rounded-3xl"
          style={{ pointerEvents: "none" }}
        />
        <canvas
          ref={(node) => dataCanvasAtom.set(node)}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute left-0 top-0 h-full w-full rounded-3xl"
          style={{ ...dimensionStyle, opacity: 0, cursor: mode === "erase" ? "not-allowed" : "crosshair" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        />
        {!isReady ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/60 text-sm text-white/70">
            Loading image…
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex items-center justify-center">
          <div className="pointer-events-auto flex items-center gap-4 rounded-full bg-neutral-900/80 px-5 py-3 text-sm text-white shadow-lg">
            <label className="flex items-center gap-2">
              <Paintbrush className="h-4 w-4" />
              <input
                type="range"
                min={8}
                max={256}
                value={brushSize}
                onChange={(event) => brushSizeAtom.set(Number(event.target.value))}
              />
              <span className="w-10 text-right text-xs text-white/70">{brushSize}px</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => modeAtom.set("brush")}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
                  mode === "brush" ? "bg-white text-black" : "bg-white/10 text-white/80"
                }`}
              >
                <Paintbrush className="h-3.5 w-3.5" /> Brush
              </button>
              <button
                type="button"
                onClick={() => modeAtom.set("erase")}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
                  mode === "erase" ? "bg-white text-black" : "bg-white/10 text-white/80"
                }`}
              >
                <Eraser className="h-3.5 w-3.5" /> Erase
              </button>
            </div>
            <button
              type="button"
              className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80"
              onClick={resetMask}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Clear Mask
            </button>
            <div className="text-xs text-white/80">Mask Coverage: {formatPercent(coverage)}</div>
          </div>
        </div>
      </div>
    </div>
  )
})
