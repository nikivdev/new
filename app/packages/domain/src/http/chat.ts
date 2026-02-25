"use rise"

import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { Authorization, UnauthorizedError } from "./current-tenant.js"

// --- Schemas ---

export class ChatMessage extends Schema.Class<ChatMessage>("ChatMessage")({
  id: Schema.String,
  role: Schema.Literal("user", "assistant"),
  content: Schema.String,
  model: Schema.optionalWith(Schema.String, { nullable: true }),
  createdAt: Schema.Number,
}) {}

export class ChatThread extends Schema.Class<ChatThread>("ChatThread")({
  id: Schema.String,
  title: Schema.String,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}) {}

export class SendMessageRequest extends Schema.Class<SendMessageRequest>(
  "SendMessageRequest",
)({
  messages: Schema.Array(
    Schema.Struct({
      role: Schema.Literal("user", "assistant"),
      content: Schema.String,
    }),
  ),
  model: Schema.optionalWith(Schema.String, {
    default: () => "cerebras/zai-glm-4.7",
  }),
  threadId: Schema.optionalWith(Schema.String, { nullable: true }),
}) {}

export class ChatError extends Schema.TaggedError<ChatError>()(
  "ChatError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 400 }),
) {}

export class ChatNotFoundError extends Schema.TaggedError<ChatNotFoundError>()(
  "ChatNotFoundError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export class UsageLimitError extends Schema.TaggedError<UsageLimitError>()(
  "UsageLimitError",
  {
    message: Schema.String,
    remaining: Schema.Number,
    limit: Schema.Number,
  },
  HttpApiSchema.annotations({ status: 429 }),
) {}

// --- API Groups ---

export class ChatApiGroup extends HttpApiGroup.make("chat")
  .add(
    HttpApiEndpoint.post("sendMessage", "/send")
      .setPayload(SendMessageRequest)
      .addSuccess(Schema.Void)
      .addError(ChatError)
      .addError(ChatNotFoundError)
      .addError(UsageLimitError),
  )
  .add(
    HttpApiEndpoint.get("listThreads", "/threads").addSuccess(
      Schema.Array(ChatThread),
    ),
  )
  .add(
    HttpApiEndpoint.del("deleteThread", "/threads/:threadId")
      .setPath(Schema.Struct({ threadId: Schema.String }))
      .addSuccess(Schema.Struct({ ok: Schema.Boolean }))
      .addError(ChatNotFoundError),
  )
  .add(
    HttpApiEndpoint.get("getThreadMessages", "/threads/:threadId/messages")
      .setPath(Schema.Struct({ threadId: Schema.String }))
      .addSuccess(Schema.Array(ChatMessage))
      .addError(ChatNotFoundError),
  )
  .prefix("/api/chat")
  .middleware(Authorization) {}

export class GuestChatApiGroup extends HttpApiGroup.make("guestChat")
  .add(
    HttpApiEndpoint.post("guestSend", "/send")
      .setPayload(SendMessageRequest)
      .addSuccess(Schema.Void)
      .addError(ChatError)
      .addError(ChatNotFoundError)
      .addError(UsageLimitError),
  )
  .prefix("/api/guest/chat") {}
