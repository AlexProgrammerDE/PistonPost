import type { ComponentType } from "react"

export function componentIdentity<Props>(
  pluginId: string,
  slot: string,
  component: ComponentType<Props>,
) {
  return `${pluginId}:${slot}:${component.displayName || component.name || "anonymous"}`
}
