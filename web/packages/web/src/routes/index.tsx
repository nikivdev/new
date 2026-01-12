import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">Welcome</h1>
      <p className="text-zinc-400">Edit src/routes/index.tsx to get started</p>
    </div>
  )
}
