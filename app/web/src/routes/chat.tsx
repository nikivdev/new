import { createFileRoute } from "@tanstack/react-router"
import { Suspense, lazy } from "react"

const ChatPage = lazy(() =>
  import("@/components/chat/ChatPage").then((mod) => ({ default: mod.ChatPage })),
)

const ChatRoute = () => (
  <Suspense fallback={null}>
    <ChatPage />
  </Suspense>
)

export const Route = createFileRoute("/chat")({
  ssr: false,
  component: ChatRoute,
})
