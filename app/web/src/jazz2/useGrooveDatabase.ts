import { atom, reatomMap } from "@/shared/reatom/core"

const DEFAULT_DB_NAME = "gen-groove"

type GrooveDbModel = {
  dbAtom: ReturnType<typeof atom<unknown | null>>
  errorAtom: ReturnType<typeof atom<string | null>>
}

const cache = reatomMap<string, GrooveDbModel>()

export const reatomGrooveDatabase = (name = DEFAULT_DB_NAME, schema?: string) => {
  void schema
  const key = `${name}:disabled`
  return cache.getOrCreate(key, () => {
    const dbAtom = atom<unknown | null>(null, `${name}.db`)
    const errorAtom = atom<string | null>("Groove disabled", `${name}.error`)
    return { dbAtom, errorAtom }
  })
}
