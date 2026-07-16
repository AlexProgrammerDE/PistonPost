"use client"

import { useBlocker } from "@tanstack/react-router"
import type { RefObject } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type UnsavedChangesGuardProps = {
  readonly allowNavigationRef?: RefObject<boolean>
  readonly enabled: boolean
}

export function UnsavedChangesGuard({ allowNavigationRef, enabled }: UnsavedChangesGuardProps) {
  const shouldBlock = () => enabled && !allowNavigationRef?.current

  const blocker = useBlocker({
    disabled: !enabled,
    enableBeforeUnload: shouldBlock,
    shouldBlockFn: shouldBlock,
    withResolver: true,
  })

  return (
    <AlertDialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open && blocker.status === "blocked") blocker.reset()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard your unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Your changes will be lost if you leave this page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={blocker.proceed}>
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
