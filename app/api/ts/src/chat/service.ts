"use rise"

import { Effect, Stream } from "effect"
import { ChatRepository } from "./repository.js"
import { AiService, getMeterForModel } from "../ai/service.js"
import { BillingService } from "../billing/service.js"
import { ChatError, ChatNotFoundError } from "@app/domain/http"

export class ChatService extends Effect.Service<ChatService>()(
  "rise/ChatService",
  {
    accessors: true,
    dependencies: [
      ChatRepository.Default,
      AiService.Default,
      BillingService.Default,
    ],
    effect: Effect.gen(function* () {
      const repo = yield* ChatRepository
      const ai = yield* AiService
      const billing = yield* BillingService

      const sendMessage = Effect.fn("ChatService.sendMessage")(
        (params: {
          userId: string
          messages: ReadonlyArray<{ role: "user" | "assistant"; content: string }>
          model: string
          threadId?: string | null
        }) =>
          Effect.gen(function* () {
            if (params.messages.length === 0) {
              return yield* Effect.fail(
                new ChatError({ message: "At least one message is required" }),
              )
            }

            const meter = getMeterForModel(params.model)

            // Check usage limits
            yield* billing.checkUsage(params.userId, meter)

            // Create or reuse thread
            let threadId = params.threadId
            if (!threadId) {
              const thread = yield* repo.createThread(params.userId)
              threadId = thread.id

              // Auto-title from first user message
              const firstUserMsg = params.messages.find(
                (m) => m.role === "user",
              )
              if (firstUserMsg) {
                const title = firstUserMsg.content.slice(0, 80)
                yield* repo.updateThreadTitle(threadId, title)
              }
            } else {
              const thread = yield* repo.getThread(threadId, params.userId)
              if (!thread) {
                return yield* Effect.fail(
                  new ChatNotFoundError({ message: "Thread not found" }),
                )
              }
            }

            // Persist the latest user message
            const lastMsg = params.messages[params.messages.length - 1]
            if (lastMsg && lastMsg.role === "user") {
              yield* repo.addMessage({
                threadId,
                role: "user",
                content: lastMsg.content,
              })
            }

            // Get AI stream
            const stream = yield* ai
              .chat(params.messages, params.model)
              .pipe(
                Effect.mapError(
                  (e) => new ChatError({ message: e.message }),
                ),
              )

            // Collect full response and persist
            const collected = { text: "" }

            const outputStream = stream.pipe(
              Stream.tap((token) =>
                Effect.sync(() => {
                  collected.text += token
                }),
              ),
              Stream.ensuring(
                Effect.gen(function* () {
                  if (collected.text.trim().length > 0) {
                    yield* repo.addMessage({
                      threadId: threadId!,
                      role: "assistant",
                      content: collected.text,
                      model: params.model,
                    })
                    yield* billing.recordUsage(
                      params.userId,
                      meter,
                      params.model,
                    )
                  }
                }),
              ),
            )

            return { threadId, stream: outputStream }
          }),
      )

      const listThreads = Effect.fn("ChatService.listThreads")(
        (userId: string) => repo.listThreads(userId),
      )

      const deleteThread = Effect.fn("ChatService.deleteThread")(
        (threadId: string, userId: string) => repo.deleteThread(threadId, userId),
      )

      const getThreadMessages = Effect.fn("ChatService.getThreadMessages")(
        (threadId: string, userId: string) =>
          Effect.gen(function* () {
            const thread = yield* repo.getThread(threadId, userId)
            if (!thread) {
              return yield* Effect.fail(
                new ChatNotFoundError({ message: "Thread not found" }),
              )
            }
            const messages = yield* repo.getMessages(threadId, userId)
            return messages.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              model: m.model ?? undefined,
              createdAt: m.createdAt,
            }))
          }),
      )

      return { sendMessage, listThreads, deleteThread, getThreadMessages } as const
    }),
  },
) {}
