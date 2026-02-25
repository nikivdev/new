import { createFileRoute } from "@tanstack/react-router"
import { requireJazzAuth } from "@/lib/jazz/server-auth"
import { withJazzServerAccount } from "@/lib/jazz/server-store"
import { DirectoryUser } from "@/lib/jazz/schema"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

export const Route = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { auth, response } = await requireJazzAuth(request)
          if (!auth) {
            return response
          }

          return await withJazzServerAccount(async (account) => {
            const users = account.root.users.map((user: any) => ({
              id: user.userId,
              name: user.name ?? null,
              email: user.email ?? null,
              image: user.image ?? null,
              updatedAt: user.updatedAt
                ? new Date(user.updatedAt).toISOString()
                : null,
            }))

            return json({ users })
          })
        } catch (err) {
          console.error("[api/users] GET error:", err)
          return json({ error: "Failed to fetch users", details: String(err) }, 500)
        }
      },
      POST: async ({ request }) => {
        try {
          const { auth, response } = await requireJazzAuth(request)
          if (!auth) {
            return response
          }

          const body = (await request.json().catch(() => ({}))) as {
            action?: string
            profile?: { name?: string | null; email?: string | null; image?: string | null }
          }

          if (body.action !== "upsertProfile") {
            return json({ error: "Unknown action" }, 400)
          }

          return await withJazzServerAccount(async (account) => {
            const now = Date.now()
            let entry = account.root.users.find(
              (user: any) => user.userId === auth.accountId,
            )

            if (!entry) {
              entry = DirectoryUser.create(
                {
                  userId: auth.accountId,
                  name: body.profile?.name ?? undefined,
                  email: body.profile?.email ?? undefined,
                  image: body.profile?.image ?? undefined,
                  updatedAt: now,
                },
                { owner: account },
              )
              account.root.users.$jazz.push(entry)
            } else {
              if (body.profile?.name !== undefined) {
                entry.$jazz.set("name", body.profile?.name ?? undefined)
              }
              if (body.profile?.email !== undefined) {
                entry.$jazz.set("email", body.profile?.email ?? undefined)
              }
              if (body.profile?.image !== undefined) {
                entry.$jazz.set("image", body.profile?.image ?? undefined)
              }
              entry.$jazz.set("updatedAt", now)
            }

            return json({ success: true })
          })
        } catch (err) {
          console.error("[api/users] POST error:", err)
          return json({ error: "Failed to update profile", details: String(err) }, 500)
        }
      },
    },
  },
})
