import * as React from "react"
import { HeadContent, Scripts, createRootRoute, Link } from "@tanstack/react-router"
import { action, atom, effect, reatomBoolean, sleep, withConnectHook, wrap } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"

import appCss from "../styles.css?url"

const SITE_URL = "https://starter.app"
const SITE_NAME = "Starter App"
const SITE_TITLE = "Starter App – Multi-Modal AI Studio"
const SITE_DESCRIPTION =
  "Craft words, songs, images, and videos in a single collaborative AI workspace that blends text, music, and visual generation tools."
const SOCIAL_IMAGE = `${SITE_URL}/logo512.png`

const clientShellAtom = atom<React.ComponentType | null>(null, 'rootClientShell')
const showLoadingAtom = reatomBoolean(false, 'rootClientLoading')

const loadClientShell = action(async () => {
  if (typeof window === 'undefined') return

  try {
    const mod = await wrap(import("../components/RootClient"))
    clientShellAtom.set(() => mod.RootClient)
  } catch (error) {
    console.error('[root] Failed to load client shell', error)
  }
}, 'loadRootClientShell')

clientShellAtom.extend(withConnectHook(loadClientShell))

if (typeof window !== "undefined") {
  effect(async () => {
    if (clientShellAtom()) {
      showLoadingAtom.set(false)
      return
    }

    showLoadingAtom.set(false)
    await wrap(sleep(2000))
    if (!clientShellAtom()) {
      showLoadingAtom.set(true)
    }
  }, "rootClientLoaderDelay")
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">404</h1>
        <p className="text-slate-600 mb-4">Page not found</p>
        <Link to="/" className="text-slate-900 underline hover:no-underline">
          Go home
        </Link>
      </div>
    </div>
  )
}

const RootClientLoader = reatomComponent(() => {
  const ClientShell = clientShellAtom()
  const showLoading = showLoadingAtom()

  if (!ClientShell) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4 py-10 text-white">
        {showLoading && (
          <div className="h-6 w-6 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
        )}
      </div>
    )
  }

  return <ClientShell />
})

export const Route = createRootRoute({
  ssr: false,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      {
        name: "keywords",
        content:
          "AI studio, text generation, music AI, song creation, image generation, video generation, multi-modal AI, creative workspace",
      },
      { name: "author", content: SITE_NAME },
      { name: "theme-color", content: "#03050a" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:image", content: SOCIAL_IMAGE },
      { property: "og:site_name", content: SITE_NAME },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: SOCIAL_IMAGE },
      { name: "twitter:creator", content: "@starter_app" },
    ],
    links: [
      { rel: "canonical", href: SITE_URL },
      { rel: "icon", href: "/favicon.ico" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  component: RootClientLoader,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
