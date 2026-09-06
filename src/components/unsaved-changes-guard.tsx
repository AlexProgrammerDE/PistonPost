"use client"

import { useBlocker } from "@tanstack/react-router"
import type { RefObject } from "react"

import { Button } from "@/components/ui/button"
import {
  Credenza,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza"

type UnsavedChangesGuardProps = {
  readonly allowNavigationRef?: RefObject<boolean>
  readonly enabled: boolean
  readonly description?: string
}

export function UnsavedChangesGuard({
  allowNavigationRef,
  enabled,
  description = "Your changes will be lost if you leave this page.",
}: UnsavedChangesGuardProps) {
  const shouldBlock = () => enabled && !allowNavigationRef?.current

  const blocker = useBlocker({
    disabled: !enabled,
    enableBeforeUnload: shouldBlock,
    shouldBlockFn: shouldBlock,
    withResolver: true,
  })

  return (
    <Credenza
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open && blocker.status === "blocked") blocker.reset()
      }}
    >
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>Discard your unsaved changes?</CredenzaTitle>
          <CredenzaDescription>{description}</CredenzaDescription>
        </CredenzaHeader>
        <CredenzaFooter>
          <CredenzaClose render={<Button variant="outline" />}>Keep editing</CredenzaClose>
          <Button variant="destructive" onClick={blocker.proceed}>
            Discard changes
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
