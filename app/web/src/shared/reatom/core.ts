import { effect as reatomEffect } from "@reatom/core"

export * from "@reatom/core"

const isBrowserRuntime = () =>
  typeof window !== "undefined" && typeof document !== "undefined"

const createNoopEffect = () => {
  const noop: any = () => undefined
  noop.pipe = () => noop
  noop.extend = () => noop
  noop.onChange = () => noop
  noop.onCall = () => noop
  noop.__reatom = {}
  return noop
}

export const effect: typeof reatomEffect = ((...args: any[]) => {
  if (!isBrowserRuntime()) {
    return createNoopEffect() as ReturnType<typeof reatomEffect>
  }
  return reatomEffect(...(args as Parameters<typeof reatomEffect>))
}) as typeof reatomEffect
