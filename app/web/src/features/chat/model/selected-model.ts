import { atom, withLocalStorage } from '@/shared/reatom/core'
import { AVAILABLE_MODELS, type ModelId } from '@/components/chat/ChatInput'

const MODEL_STORAGE_KEY = 'gen_chat_model'
const DEFAULT_MODEL = AVAILABLE_MODELS[0].id

export const selectedModelAtom = atom<ModelId>(DEFAULT_MODEL, 'selectedModel').extend(
  withLocalStorage({
    key: MODEL_STORAGE_KEY,
    toSnapshot: (value) => value,
    fromSnapshot: (raw) => {
      if (typeof raw !== 'string') return DEFAULT_MODEL
      return (AVAILABLE_MODELS.some((m) => m.id === raw) ? raw : DEFAULT_MODEL) as ModelId
    },
  }),
)
