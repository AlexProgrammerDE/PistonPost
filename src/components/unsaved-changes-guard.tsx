"use client"

import { useBlocker } from "@tanstack/react-router"
import type { RefObject } from "react"

type UnsavedChangesGuardProps = {
  readonly allowNavigationRef?: RefObject<boolean>
  readonly enabled: boolean
}

export function UnsavedChangesGuard({ allowNavigationRef, enabled }: UnsavedChangesGuardProps) {
  const shouldBlock = () => enabled && !allowNavigationRef?.current

  useBlocker({
    disabled: !enabled,
    enableBeforeUnload: shouldBlock,
    shouldBlockFn: () => shouldBlock() && !window.confirm("Discard your unsaved changes?"),
  })

  return null
}
