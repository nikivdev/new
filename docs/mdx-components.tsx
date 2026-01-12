import defaultMdxComponents from "fumadocs-ui/mdx"
import type { ImgHTMLAttributes } from "react"
import type { MDXComponents } from "mdx/types"

const Img = ({
  src,
  alt,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) => {
  if (!src) return null
  return (
    <img
      src={src}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      {...props}
    />
  )
}

export function useMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    img: Img,
    Image: Img,
    ...components,
  }
}
