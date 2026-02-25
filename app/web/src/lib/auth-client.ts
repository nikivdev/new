import { createAuthClient } from "better-auth/client"
import { emailOTPClient } from "better-auth/client/plugins"
import { jazzPluginClient } from "jazz-tools/better-auth/auth/client"

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
  plugins: [
    emailOTPClient(),
    jazzPluginClient(),
  ],
})
