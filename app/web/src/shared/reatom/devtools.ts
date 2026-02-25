import { action, effect, onEvent, reatomBoolean } from '@/shared/reatom/core'

export const devtoolsVisibleAtom = reatomBoolean(false, 'devtoolsVisible')

export const toggleDevtools = action(() => {
  devtoolsVisibleAtom.toggle()
}, 'toggleDevtools')

effect(() => {
  if (typeof window === 'undefined') return

  const handler = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.shiftKey && event.key === 'D') {
      event.preventDefault()
      toggleDevtools()
    }
  }

  onEvent(window, 'keydown', handler)
}, 'devtoolsKeydown')
