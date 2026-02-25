import { createFileRoute } from "@tanstack/react-router"
import { reatomComponent } from "@reatom/react"
import { AVAILABLE_MODELS } from "@/components/chat/ChatInput"
import {
  SectionHeader,
  SettingCard,
  SettingRow,
  InlineSelect,
} from "@/lib/settings-components"
import { selectedModelAtom } from "@/features/chat/model/selected-model"
import {
  buildShortcutFromEvent,
  formatShortcut,
  shortcutMapAtom,
  updateShortcuts,
} from "@/features/settings/shortcuts"

export const Route = createFileRoute("/settings/preferences")({
  component: PreferencesPage,
})

const PreferencesPage = reatomComponent(() => {
  const selectedModel = selectedModelAtom()
  const shortcuts = shortcutMapAtom()

  const handleModelChange = (modelId: string) => {
    selectedModelAtom.set(modelId as typeof selectedModel)
  }

  const handleShortcutChange = (
    id: keyof typeof shortcuts,
    value: string | null,
  ) => {
    updateShortcuts({ [id]: value })
  }

  return (
    <div id="preferences" className="scroll-mt-24">
      <SectionHeader
        title="Preferences"
        description="Configure your chat experience."
      />
      <div className="space-y-5">
        <SettingCard title="Chat">
          <SettingRow
            title="Default model"
            description="The AI model used for new conversations."
            control={
              <InlineSelect
                value={selectedModel}
                options={AVAILABLE_MODELS.map((m) => ({
                  value: m.id,
                  label: m.name,
                }))}
                onChange={handleModelChange}
              />
            }
          />
        </SettingCard>
        <SettingCard title="Shortcuts">
          <SettingRow
            title="New chat"
            description="Start a fresh conversation."
            control={
              <ShortcutInput
                value={shortcuts.newChat}
                onChange={(value) => handleShortcutChange("newChat", value)}
              />
            }
          />
          <SettingRow
            title="Toggle sidebar"
            description="Collapse or expand the context sidebar."
            control={
              <ShortcutInput
                value={shortcuts.toggleSidebar}
                onChange={(value) => handleShortcutChange("toggleSidebar", value)}
              />
            }
          />
          <SettingRow
            title="UI mode"
            description="Jump into UI mode and connect the UI workspace."
            control={
              <ShortcutInput
                value={shortcuts.uiMode}
                onChange={(value) => handleShortcutChange("uiMode", value)}
              />
            }
          />
          <SettingRow
            title="Computer use"
            description="Open Computer Use mode and start a browser session."
            control={
              <ShortcutInput
                value={shortcuts.musicMode}
                onChange={(value) => handleShortcutChange("musicMode", value)}
              />
            }
          />
          <SettingRow
            title="Env mode"
            description="Open env paste mode for saving secrets via Hive."
            control={
              <ShortcutInput
                value={shortcuts.envMode}
                onChange={(value) => handleShortcutChange("envMode", value)}
              />
            }
          />
          <SettingRow
            title="Find in chat"
            description="Search within the current chat transcript."
            control={
              <ShortcutInput
                value={shortcuts.findInChat}
                onChange={(value) => handleShortcutChange("findInChat", value)}
              />
            }
          />
          <SettingRow
            title="Command palette"
            description="Open the command palette for quick actions."
            control={
              <ShortcutInput
                value={shortcuts.commandPalette}
                onChange={(value) => handleShortcutChange("commandPalette", value)}
              />
            }
          />
          <SettingRow
            title="Switch projects"
            description="Open the project switcher."
            control={
              <ShortcutInput
                value={shortcuts.switchProjects}
                onChange={(value) => handleShortcutChange("switchProjects", value)}
              />
            }
          />
          <SettingRow
            title="Explain mode"
            description="Toggle explain mode for visual explanations."
            control={
              <ShortcutInput
                value={shortcuts.explainMode}
                onChange={(value) => handleShortcutChange("explainMode", value)}
              />
            }
          />
        </SettingCard>
      </div>
    </div>
  )
})

const ShortcutInput = ({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string | null) => void
}) => {
  return (
    <input
      value={formatShortcut(value)}
      readOnly
      placeholder="Press keys"
      onKeyDown={(event) => {
        event.preventDefault()
        if (event.key === "Escape") {
          event.currentTarget.blur()
          return
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          onChange(null)
          return
        }
        const next = buildShortcutFromEvent(event)
        if (next) {
          onChange(next)
        }
      }}
      onFocus={(event) => event.currentTarget.select()}
      className="min-w-[160px] bg-white/5 border border-white/10 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
    />
  )
}
