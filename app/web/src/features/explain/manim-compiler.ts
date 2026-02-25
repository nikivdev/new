/**
 * Manim Compiler
 *
 * Compiles our ManimScene schema to Python Manim code.
 */

import type {
  ManimScene,
  ManimObject,
  ManimAnimation,
} from "./schema"

/**
 * Compile a ManimScene to Python code
 */
export function compileScene(scene: ManimScene): string {
  const lines: string[] = []

  // Imports
  lines.push("from manim import *")
  lines.push("")

  // Class definition
  lines.push(`class ${scene.name}(Scene):`)
  lines.push("    def construct(self):")

  // Background color
  if (scene.backgroundColor) {
    lines.push(
      `        self.camera.background_color = "${scene.backgroundColor}"`,
    )
  }

  // Create objects
  lines.push("")
  lines.push("        # Create objects")
  for (const obj of scene.objects) {
    const objCode = compileObject(obj)
    lines.push(`        ${obj.id} = ${objCode}`)

    // Position
    if (obj.position) {
      const pos = obj.position
      if (pos.length === 2) {
        lines.push(`        ${obj.id}.move_to(np.array([${pos[0]}, ${pos[1]}, 0]))`)
      } else if (pos.length === 3) {
        lines.push(
          `        ${obj.id}.move_to(np.array([${pos[0]}, ${pos[1]}, ${pos[2]}]))`,
        )
      }
    }
  }

  // Animations
  lines.push("")
  lines.push("        # Animations")
  for (const anim of scene.animations) {
    const animCode = compileAnimation(anim)
    lines.push(`        ${animCode}`)
  }

  // Final wait
  lines.push("")
  lines.push("        self.wait()")

  return lines.join("\n")
}

/**
 * Compile a ManimObject to Python constructor
 */
function compileObject(obj: ManimObject): string {
  const props = obj.props || {}

  switch (obj.type) {
    case "circle": {
      const radius = props.radius ?? 1
      const color = obj.color ? `, color="${obj.color}"` : ""
      const fill = obj.fillOpacity ? `, fill_opacity=${obj.fillOpacity}` : ""
      return `Circle(radius=${radius}${color}${fill})`
    }

    case "square": {
      const side = props.sideLength ?? 2
      const color = obj.color ? `, color="${obj.color}"` : ""
      const fill = obj.fillOpacity ? `, fill_opacity=${obj.fillOpacity}` : ""
      return `Square(side_length=${side}${color}${fill})`
    }

    case "rectangle": {
      const width = props.width ?? 2
      const height = props.height ?? 1
      const color = obj.color ? `, color="${obj.color}"` : ""
      const fill = obj.fillOpacity ? `, fill_opacity=${obj.fillOpacity}` : ""
      return `Rectangle(width=${width}, height=${height}${color}${fill})`
    }

    case "triangle": {
      const color = obj.color ? `, color="${obj.color}"` : ""
      const fill = obj.fillOpacity ? `, fill_opacity=${obj.fillOpacity}` : ""
      return `Triangle()${color}${fill}`.replace(")(", ", ")
    }

    case "line": {
      const start = (props.start as number[]) ?? [0, 0, 0]
      const end = (props.end as number[]) ?? [1, 0, 0]
      const color = obj.color ? `, color="${obj.color}"` : ""
      return `Line(np.array([${start.join(", ")}]), np.array([${end.join(", ")}])${color})`
    }

    case "arrow": {
      const start = (props.start as number[]) ?? [0, 0, 0]
      const end = (props.end as number[]) ?? [1, 0, 0]
      const color = obj.color ? `, color="${obj.color}"` : ""
      return `Arrow(np.array([${start.join(", ")}]), np.array([${end.join(", ")}])${color})`
    }

    case "dot": {
      const color = obj.color ? `color="${obj.color}"` : ""
      return `Dot(${color})`
    }

    case "text": {
      const text = props.text ?? ""
      const color = obj.color ? `, color="${obj.color}"` : ""
      const fontSize = props.fontSize ? `, font_size=${props.fontSize}` : ""
      return `Text("${text}"${color}${fontSize})`
    }

    case "tex": {
      const tex = props.tex ?? ""
      const color = obj.color ? `.set_color("${obj.color}")` : ""
      return `Tex(r"${tex}")${color}`
    }

    case "mathtex": {
      const tex = props.tex ?? ""
      const color = obj.color ? `.set_color("${obj.color}")` : ""
      return `MathTex(r"${tex}")${color}`
    }

    case "numberline": {
      const xRange = (props.xRange as number[]) ?? [0, 10, 1]
      const length = props.length ?? 10
      return `NumberLine(x_range=[${xRange.join(", ")}], length=${length})`
    }

    case "axes": {
      const xRange = (props.xRange as number[]) ?? [0, 10, 1]
      const yRange = (props.yRange as number[]) ?? [0, 10, 1]
      return `Axes(x_range=[${xRange.join(", ")}], y_range=[${yRange.join(", ")}])`
    }

    case "graph": {
      // Graph needs to be added to axes, this is a placeholder
      const func = props.func ?? "lambda x: x"
      const color = obj.color ? `, color="${obj.color}"` : ""
      return `# Graph: ${func}${color}`
    }

    case "barchart": {
      const values = (props.values as number[]) ?? [1, 2, 3]
      const barNames = (props.barNames as string[]) ?? values.map((_, i) => `Item ${i + 1}`)
      return `BarChart(values=[${values.join(", ")}], bar_names=[${barNames.map((n) => `"${n}"`).join(", ")}])`
    }

    case "group": {
      const children = (props.children as string[]) ?? []
      return `VGroup(${children.join(", ")})`
    }

    default:
      return `# Unknown type: ${obj.type}`
  }
}

/**
 * Compile a ManimAnimation to Python code
 */
function compileAnimation(anim: ManimAnimation): string {
  const targets = Array.isArray(anim.target) ? anim.target : [anim.target]
  const duration = anim.duration ? `, run_time=${anim.duration}` : ""
  const params = anim.params || {}

  switch (anim.type) {
    case "create":
      if (targets.length === 1) {
        return `self.play(Create(${targets[0]})${duration})`
      }
      return `self.play(${targets.map((t) => `Create(${t})`).join(", ")}${duration})`

    case "write":
      if (targets.length === 1) {
        return `self.play(Write(${targets[0]})${duration})`
      }
      return `self.play(${targets.map((t) => `Write(${t})`).join(", ")}${duration})`

    case "fadein":
      if (targets.length === 1) {
        return `self.play(FadeIn(${targets[0]})${duration})`
      }
      return `self.play(${targets.map((t) => `FadeIn(${t})`).join(", ")}${duration})`

    case "fadeout":
      if (targets.length === 1) {
        return `self.play(FadeOut(${targets[0]})${duration})`
      }
      return `self.play(${targets.map((t) => `FadeOut(${t})`).join(", ")}${duration})`

    case "transform": {
      const to = params.to as string
      return `self.play(Transform(${targets[0]}, ${to})${duration})`
    }

    case "move": {
      const pos = params.position as number[] ?? [0, 0, 0]
      return `self.play(${targets[0]}.animate.move_to(np.array([${pos.join(", ")}]))${duration})`
    }

    case "rotate": {
      const angle = params.angle ?? Math.PI
      return `self.play(Rotate(${targets[0]}, angle=${angle})${duration})`
    }

    case "scale": {
      const factor = params.factor ?? 2
      return `self.play(${targets[0]}.animate.scale(${factor})${duration})`
    }

    case "indicate":
      if (targets.length === 1) {
        return `self.play(Indicate(${targets[0]})${duration})`
      }
      return `self.play(${targets.map((t) => `Indicate(${t})`).join(", ")}${duration})`

    case "circumscribe":
      return `self.play(Circumscribe(${targets[0]})${duration})`

    case "wait": {
      const waitDuration = anim.duration ?? 1
      return `self.wait(${waitDuration})`
    }

    default:
      return `# Unknown animation: ${anim.type}`
  }
}

/**
 * Generate a full Python file for rendering
 */
export function generatePythonFile(scene: ManimScene, outputPath?: string): string {
  const code = compileScene(scene)

  const renderCommand = outputPath
    ? `# Render with: manim -pql ${outputPath} ${scene.name}`
    : `# Render with: manim -pql script.py ${scene.name}`

  return `${renderCommand}\n\nimport numpy as np\n${code}`
}
