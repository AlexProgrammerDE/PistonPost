"use client"

import { useBlocker } from "@tanstack/react-router"

export function UnsavedChangesGuard({ enabled }: { readonly enabled: boolean }) {
  useBlocker({
    disabled: !enabled,
    enableBeforeUnload: enabled,
    shouldBlockFn: () => !window.confirm("Discard your unsaved changes?"),
  })

  return null
}
