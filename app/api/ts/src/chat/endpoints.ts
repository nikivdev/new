"use rise"

import { Effect, Stream, Schema } from "effect"
import {
  HttpApiBuilder,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform"
import {
  RiseApi,
  SendMessageRequest,
  ChatNotFoundError,
  ChatError,
  CurrentTenant,
} from "@app/domain/http"
import { ChatService } from "./service.js"

const resolveGuestUserId = (
  headers: Record<string, string | undefined>,
): string => {
  const raw = headers["x-guest-id"]?.trim() ?? ""
  if (/^[a-zA-Z0-9_-]{8,64}$/.test(raw)) {
    return `guest:${raw}`
  }
  return "guest:anon"
}

export const HttpChatLive = HttpApiBuilder.group(
  RiseApi,
  "chat",
  (handlers) =>
    Effect.gen(function* () {
      const chatService = yield* ChatService

      return handlers
        .handleRaw("sendMessage", () =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            const request = yield* HttpServerRequest.HttpServerRequest
            const body = yield* request.json.pipe(
              Effect.catchAll(() =>
                Effect.fail(new ChatError({ message: "Invalid JSON body" })),
              ),
            )
            const payload = yield* Schema.decodeUnknown(SendMessageRequest)(
              body,
            ).pipe(
              Effect.mapError(
                () => new ChatError({ message: "Invalid request body" }),
              ),
            )

            const { threadId, stream } = yield* chatService.sendMessage({
              userId: tenant.userId,
              messages: payload.messages as Array<{
                role: "user" | "assistant"
                content: string
              }>,
              model: payload.model,
              threadId: payload.threadId,
            })

            const sseStream = stream.pipe(
              Stream.map(
                (token) =>
                  `data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`,
              ),
              Stream.catchAll((error) =>
                Stream.make(
                  `data: ${JSON.stringify({ error: { message: error.message } })}\n\n`,
                ),
              ),
              Stream.concat(Stream.make("data: [DONE]\n\n")),
              Stream.encodeText,
            )

            return yield* HttpServerResponse.stream(sseStream as Stream.Stream<Uint8Array, never>, {
              contentType: "text/event-stream",
              headers: {
                "cache-control": "no-cache",
                connection: "keep-alive",
                "x-thread-id": threadId,
              },
            })
          }),
        )
        .handle("listThreads", () =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            const threads = yield* chatService.listThreads(tenant.userId)
            return threads.map((t) => ({
              ...t,
              id: t.id as string,
              title: t.title as string,
              createdAt: t.createdAt as number,
              updatedAt: t.updatedAt as number,
            }))
          }),
        )
        .handle("deleteThread", ({ path }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            const deleted = yield* chatService.deleteThread(
              path.threadId,
              tenant.userId,
            )
            if (!deleted) {
              return yield* Effect.fail(
                new ChatNotFoundError({ message: "Thread not found" }),
              )
            }
            return { ok: true as const }
          }),
        )
        .handle("getThreadMessages", ({ path }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            const messages = yield* chatService.getThreadMessages(
              path.threadId,
              tenant.userId,
            )
            return messages
          }),
        )
    }),
)

export const HttpGuestChatLive = HttpApiBuilder.group(
  RiseApi,
  "guestChat",
  (handlers) =>
    Effect.gen(function* () {
      const chatService = yield* ChatService

      return handlers.handleRaw("guestSend", () =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const guestUserId = resolveGuestUserId(
            request.headers as Record<string, string | undefined>,
          )
          const body = yield* request.json.pipe(
            Effect.catchAll(() =>
              Effect.fail(new ChatError({ message: "Invalid JSON body" })),
            ),
          )
          const payload = yield* Schema.decodeUnknown(SendMessageRequest)(
            body,
          ).pipe(
            Effect.mapError(
              () => new ChatError({ message: "Invalid request body" }),
            ),
          )

          const { threadId, stream } = yield* chatService.sendMessage({
            userId: guestUserId,
            messages: payload.messages as Array<{
              role: "user" | "assistant"
              content: string
            }>,
            model: payload.model,
            threadId: payload.threadId,
          })

          const sseStream = stream.pipe(
            Stream.map(
              (token) =>
                `data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`,
            ),
            Stream.catchAll((error) =>
              Stream.make(
                `data: ${JSON.stringify({ error: { message: error.message } })}\n\n`,
              ),
            ),
            Stream.concat(Stream.make("data: [DONE]\n\n")),
            Stream.encodeText,
          )

          return yield* HttpServerResponse.stream(sseStream as Stream.Stream<Uint8Array, never>, {
            contentType: "text/event-stream",
            headers: {
              "cache-control": "no-cache",
              connection: "keep-alive",
              "x-thread-id": threadId,
            },
          })
        }),
      )
    }),
)
