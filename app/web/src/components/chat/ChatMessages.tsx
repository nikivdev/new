import { Sparkles } from "lucide-react"
import {
  MessageBubble,
  StreamingMessage,
  hasRenderableStreaming,
  type Message,
} from "./MessageBubble"

export function EmptyChatState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[45vh] sm:min-h-[60vh] text-center">
      <div className="w-16 h-16 rounded-3xl bg-linear-to-b from-teal-500/20 to-teal-500/5 flex items-center justify-center mb-6 shadow-lg">
        <Sparkles className="w-8 h-8 text-teal-400" />
      </div>
    </div>
  )
}

interface MessageListProps {
  messages: Message[]
  streamingContent: string
  isStreaming: boolean
  showStreaming?: boolean
}

export function MessageList({
  messages,
  streamingContent,
  isStreaming,
  showStreaming = true,
}: MessageListProps) {
  return (
    <div className="space-y-6 pb-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {showStreaming &&
        isStreaming &&
        streamingContent &&
        hasRenderableStreaming(streamingContent) && (
          <StreamingMessage content={streamingContent} />
        )}
    </div>
  )
}
