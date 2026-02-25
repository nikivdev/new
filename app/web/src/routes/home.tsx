import { createFileRoute } from "@tanstack/react-router"
import { action, atom, reatomBoolean, wrap } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"
import { HomeNav } from "@/components/home/HomeNav"

export const Route = createFileRoute("/home")({
  ssr: false,
  component: HomePage,
})

type ConversationMessage = {
  role: "user" | "assistant"
  content: string
}

const homeInputAtom = atom('', 'homeInput')
const homeMessagesAtom = atom<ConversationMessage[]>([], 'homeMessages')
const homeThreadIdAtom = atom<number | null>(null, 'homeThreadId')
const homeSendingAtom = reatomBoolean(false, 'homeIsSending')
const homeErrorAtom = atom<string | null>(null, 'homeError')
const homeStartedAtom = reatomBoolean(false, 'homeHasStarted')

const heroCopy = {
  title: 'Supercharge every creative flow',
  body: 'Switch between text, music, images, and video generation without leaving the same surface. Save canvases, branch ideas, and invite collaborators when you\'re ready.',
}

const sendHomeMessage = action(async () => {
  const input = homeInputAtom().trim()
  if (!input || homeSendingAtom()) return

  const userMessage: ConversationMessage = { role: 'user', content: input }
  const nextMessages: ConversationMessage[] = [...homeMessagesAtom(), userMessage]

  homeMessagesAtom.set(nextMessages)
  homeInputAtom.set('')
  homeSendingAtom.set(true)
  homeErrorAtom.set(null)
  homeStartedAtom.set(true)

  try {
    const response = await wrap(fetch('/api/chat/guest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: nextMessages,
        threadId: homeThreadIdAtom(),
      }),
    }))

    let incomingThreadId = response.headers.get('x-thread-id')
    let text = await response.text()

    if (!incomingThreadId) {
      const newlineIndex = text.indexOf('\n')
      if (newlineIndex > 0) {
        const maybeJson = text.slice(0, newlineIndex)
        try {
          const parsed = JSON.parse(maybeJson)
          if (typeof parsed.threadId === 'number') {
            incomingThreadId = String(parsed.threadId)
          }
          text = text.slice(newlineIndex + 1)
        } catch {
          // ignore parse failure
        }
      }
    }

    if (incomingThreadId) {
      homeThreadIdAtom.set(Number(incomingThreadId))
    }

    const assistantReply = text.trim() || "I'm still thinking about that!"
    homeMessagesAtom.set((prev) => [...prev, { role: 'assistant', content: assistantReply }])
  } catch (error) {
    console.error('[home] guest chat failed', error)
    homeErrorAtom.set('Something went wrong. Please try again.')
  } finally {
    homeSendingAtom.set(false)
  }
}, 'homeSendMessage')

const HomePage = reatomComponent(() => {
  const input = homeInputAtom()
  const messages = homeMessagesAtom()
  const isSending = homeSendingAtom()
  const error = homeErrorAtom()
  const hasStarted = homeStartedAtom()

  const layoutAlignment = hasStarted ? 'justify-between' : 'justify-center'

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05060c] via-[#090b18] to-[#0e1023] text-white">
      <HomeNav />
      <section className="flex min-h-screen flex-col pt-24 pb-8">
        <div className={`flex flex-1 flex-col items-center ${layoutAlignment} gap-8 px-6 text-center`}>
          {!hasStarted ? (
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.5em] text-white/50">
                Multi-modal AI studio
              </p>
              <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
                {heroCopy.title}
              </h1>
              <p className="max-w-2xl text-base text-white/70">{heroCopy.body}</p>
            </div>
          ) : (
            <div className="w-full max-w-2xl space-y-4 text-left">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-white text-slate-900'
                        : 'bg-white/10 text-white/90'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {isSending ? (
                <div className="text-xs uppercase tracking-[0.3em] text-white/40">
                  Thinking…
                </div>
              ) : null}
            </div>
          )}

          <form
            className="w-full max-w-2xl"
            onSubmit={(event) => {
              event.preventDefault()
              sendHomeMessage()
            }}
          >
            <textarea
              rows={3}
              className="w-full resize-none rounded-[32px] border border-white/15 bg-white/5 px-5 py-4 text-base text-white placeholder:text-white/40 shadow-[0_10px_40px_rgba(5,8,20,0.45)] backdrop-blur focus:outline-none"
              placeholder="Describe a song, a visual, or an idea you want to blend."
              value={input}
              onChange={(event) => homeInputAtom.set(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendHomeMessage()
                }
              }}
              disabled={isSending}
            />
            {error ? (
              <p className="sr-only" aria-live="polite">
                {error}
              </p>
            ) : null}
          </form>
        </div>
      </section>
    </div>
  )
})
