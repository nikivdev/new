import { action, atom, effect, withConnectHook } from "@/shared/reatom/core"

export type AppTheme = "dark" | "light"

const STORAGE_KEY = "gen.app.theme"
const DEFAULT_THEME: AppTheme = "dark"

const isTheme = (value: string | null): value is AppTheme =>
  value === "dark" || value === "light"

const resolveTheme = (): AppTheme => {
  if (typeof window === "undefined") return DEFAULT_THEME
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (isTheme(stored)) return stored
  return DEFAULT_THEME
}

const applyTheme = (theme: AppTheme) => {
  if (typeof document === "undefined") return
  document.documentElement.setAttribute("data-theme", theme)
  document.documentElement.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute("content", theme === "light" ? "#eaf2ff" : "#03050a")
  }
}

const initTheme = action(() => {
  const theme = resolveTheme()
  appThemeAtom.set(theme)
  applyTheme(theme)
}, "initTheme")

export const appThemeAtom = atom<AppTheme>(DEFAULT_THEME, "appTheme").extend(
  withConnectHook(initTheme),
)

export const toggleAppTheme = action(() => {
  appThemeAtom.set(appThemeAtom() === "dark" ? "light" : "dark")
}, "toggleAppTheme")

effect(() => {
  const theme = appThemeAtom()
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, theme)
  applyTheme(theme)
}, "syncTheme")
