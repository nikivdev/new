import { requireJazzAuth } from "@/lib/jazz/server-auth"

const unauthorizedResponse = () =>
  new Response(JSON.stringify({ error: "Authentication required" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  })

export async function resolveCanvasUser(request: Request) {
  const { auth, response } = await requireJazzAuth(request)
  if (!auth) {
    throw response ?? unauthorizedResponse()
  }

  return {
    auth,
    userId: auth.accountId,
    setCookie: undefined as string | undefined,
  }
}
