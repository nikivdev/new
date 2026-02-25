type SseChoice = {
  delta?: {
    content?: string
    reasoning?: string
    text?: string
  }
  message?: { content?: string }
  text?: string
  reasoning?: string
  finish_reason?: string | null
}

export type SseEvent = {
  id?: string
  choices?: SseChoice[]
  created?: number
  model?: string
  object?: string
}

export type StreamSseResult = {
  text: string
  events: number
  doneMarkerSeen: boolean
  timedOut: boolean
}

export type StreamSseOptions = {
  response: Response
  timeoutMs?: number
  onToken?: (token: string) => void
  onEvent?: (event: SseEvent, raw: string) => void
}

const normalizeToken = (value: unknown) => {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => normalizeToken(item)).join('')
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.text === 'string') return record.text
    if (typeof record.content === 'string') return record.content
    return JSON.stringify(record)
  }
  return ''
}

const pickFirstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const token = normalizeToken(value)
    if (token.length > 0) return token
  }
  return ''
}

const extractDelta = (event: SseEvent) => {
  const choice = event.choices?.[0]
  return pickFirstNonEmpty(
    choice?.delta?.content,
    choice?.delta?.text,
    choice?.delta?.reasoning,
    choice?.message?.content,
    choice?.text,
    choice?.reasoning,
  )
}

export async function streamSseText({
  response,
  timeoutMs = 30000,
  onToken,
  onEvent,
}: StreamSseOptions): Promise<StreamSseResult> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let events = 0
  let doneMarkerSeen = false
  let timedOut = false

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const data = trimmed.replace(/^data:\s*/, '')
    if (!data) return
    if (data === '[DONE]') {
      doneMarkerSeen = true
      return
    }
    try {
      const json = JSON.parse(data) as SseEvent
      events += 1
      if (onEvent) {
        onEvent(json, data)
      }
      const delta = extractDelta(json)
      if (delta) {
        text += delta
        onToken?.(delta)
      }
      if (json.choices?.[0]?.finish_reason) {
        doneMarkerSeen = true
      }
    } catch {
      // ignore parse errors for non-json lines
    }
  }

  while (true) {
    const readResult = await Promise.race([
      reader.read(),
      new Promise<{ timeout: true }>((resolve) =>
        setTimeout(() => resolve({ timeout: true }), timeoutMs),
      ),
    ])

    if ('timeout' in readResult) {
      timedOut = true
      try {
        await reader.cancel()
      } catch {
        // ignore cancel errors
      }
      break
    }

    const { done, value } = readResult
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      handleLine(line)
    }
    if (doneMarkerSeen) {
      try {
        await reader.cancel()
      } catch {
        // ignore cancel errors
      }
      break
    }
  }

  if (buffer.trim().length) {
    handleLine(buffer)
  }

  return {
    text,
    events,
    doneMarkerSeen,
    timedOut,
  }
}
