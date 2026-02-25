import { effect, onEvent, reatomBoolean } from '@/shared/reatom/core'

export const isSmallScreenAtom = reatomBoolean(false, 'isSmallScreen')

effect(() => {
  if (typeof window === 'undefined') return

  const mql = window.matchMedia('(max-width: 639px)')
  isSmallScreenAtom.set(mql.matches)

  if ('addEventListener' in mql) {
    onEvent(mql, 'change', (event: MediaQueryListEvent) => {
      isSmallScreenAtom.set(event.matches)
    })
  } else {
    onEvent(mql as any, 'change', (event: MediaQueryListEvent) => {
      isSmallScreenAtom.set(event.matches)
    })
  }
}, 'isSmallScreenListener')
