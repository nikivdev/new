"use rise"

import { Effect } from "effect"
import { Database } from "../database/live.js"

const generateId = () => crypto.randomUUID()

export class ChatRepository extends Effect.Service<ChatRepository>()(
  "rise/ChatRepository",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const db = yield* Database

      const createThread = Effect.fn("ChatRepository.createThread")(
        (userId: string, title?: string) =>
          Effect.gen(function* () {
            const id = generateId()
            const now = Date.now()
            const t = title ?? "New Chat"
            yield* Effect.tryPromise({
              try: () =>
                db.execute({
                  sql: `INSERT INTO chat_threads (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
                  args: [id, userId, t, now, now],
                }),
              catch: (e) => new Error(`Failed to create thread: ${e}`),
            }).pipe(Effect.orDie)
            return { id, title: t, createdAt: now, updatedAt: now }
          }),
      )

      const listThreads = Effect.fn("ChatRepository.listThreads")(
        (userId: string) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.execute({
                sql: `SELECT id, title, created_at, updated_at FROM chat_threads WHERE user_id = ? ORDER BY updated_at DESC`,
                args: [userId],
              })
              return result.rows.map((r) => ({
                id: r.id as string,
                title: r.title as string,
                createdAt: r.created_at as number,
                updatedAt: r.updated_at as number,
              }))
            },
            catch: (e) => new Error(`Failed to list threads: ${e}`),
          }).pipe(Effect.orDie),
      )

      const getThread = Effect.fn("ChatRepository.getThread")(
        (threadId: string, userId: string) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.execute({
                sql: `SELECT id, title, created_at, updated_at
                      FROM chat_threads
                      WHERE id = ? AND user_id = ?
                      LIMIT 1`,
                args: [threadId, userId],
              })
              const row = result.rows[0]
              if (!row) return null
              return {
                id: row.id as string,
                title: row.title as string,
                createdAt: row.created_at as number,
                updatedAt: row.updated_at as number,
              }
            },
            catch: (e) => new Error(`Failed to get thread: ${e}`),
          }).pipe(Effect.orDie),
      )

      const deleteThread = Effect.fn("ChatRepository.deleteThread")(
        (threadId: string, userId: string) =>
          Effect.gen(function* () {
            const thread = yield* getThread(threadId, userId)
            if (!thread) return false

            // Delete messages first (FK cascade may not work with libsql)
            yield* Effect.tryPromise({
              try: () =>
                db.execute({
                  sql: `DELETE FROM chat_messages WHERE thread_id = ?`,
                  args: [threadId],
                }),
              catch: (e) => new Error(`Failed to delete messages: ${e}`),
            }).pipe(Effect.orDie)

            const result = yield* Effect.tryPromise({
              try: () =>
                db.execute({
                  sql: `DELETE FROM chat_threads WHERE id = ? AND user_id = ?`,
                  args: [threadId, userId],
                }),
              catch: (e) => new Error(`Failed to delete thread: ${e}`),
            }).pipe(Effect.orDie)
            return (result.rowsAffected ?? 0) > 0
          }),
      )

      const getMessages = Effect.fn("ChatRepository.getMessages")(
        (threadId: string, userId: string) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.execute({
                sql: `SELECT m.id, m.thread_id, m.role, m.content, m.model, m.created_at
                      FROM chat_messages m
                      INNER JOIN chat_threads t ON t.id = m.thread_id
                      WHERE m.thread_id = ? AND t.user_id = ?
                      ORDER BY m.created_at ASC`,
                args: [threadId, userId],
              })
              return result.rows.map((r) => ({
                id: r.id as string,
                threadId: r.thread_id as string,
                role: r.role as "user" | "assistant",
                content: r.content as string,
                model: (r.model as string | null) ?? undefined,
                createdAt: r.created_at as number,
              }))
            },
            catch: (e) => new Error(`Failed to get messages: ${e}`),
          }).pipe(Effect.orDie),
      )

      const addMessage = Effect.fn("ChatRepository.addMessage")(
        (message: {
          threadId: string
          role: "user" | "assistant"
          content: string
          model?: string | null
        }) =>
          Effect.gen(function* () {
            const id = generateId()
            const now = Date.now()
            yield* Effect.tryPromise({
              try: () =>
                db.execute({
                  sql: `INSERT INTO chat_messages (id, thread_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                  args: [
                    id,
                    message.threadId,
                    message.role,
                    message.content,
                    message.model ?? null,
                    now,
                  ],
                }),
              catch: (e) => new Error(`Failed to add message: ${e}`),
            }).pipe(Effect.orDie)

            // Update thread timestamp
            yield* Effect.tryPromise({
              try: () =>
                db.execute({
                  sql: `UPDATE chat_threads SET updated_at = ? WHERE id = ?`,
                  args: [now, message.threadId],
                }),
              catch: (e) => new Error(`Failed to update thread: ${e}`),
            }).pipe(Effect.orDie)

            return { id, createdAt: now }
          }),
      )

      const updateThreadTitle = Effect.fn("ChatRepository.updateThreadTitle")(
        (threadId: string, title: string) =>
          Effect.tryPromise({
            try: () =>
              db.execute({
                sql: `UPDATE chat_threads SET title = ?, updated_at = ? WHERE id = ?`,
                args: [title, Date.now(), threadId],
              }),
            catch: (e) => new Error(`Failed to update thread title: ${e}`),
          }).pipe(Effect.asVoid, Effect.orDie),
      )

      return {
        createThread,
        listThreads,
        getThread,
        deleteThread,
        getMessages,
        addMessage,
        updateThreadTitle,
      } as const
    }),
  },
) {}
