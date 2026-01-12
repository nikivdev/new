import { Outlet, createRootRoute } from "@tanstack/react-router"

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Outlet />
    </div>
  ),
})
