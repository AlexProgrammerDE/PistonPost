"use client"

import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react"

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
import {
  externalLinkDestination,
  externalLinkWarningPath,
  safeExternalUserGeneratedUrl,
  safeUserGeneratedUrl,
  userGeneratedLinkRel,
  type UserGeneratedLinkRelationship,
} from "@/lib/user-generated-link"

type UserGeneratedLinkContextValue = (href: string) => void

const UserGeneratedLinkContext = createContext<UserGeneratedLinkContextValue | null>(null)

function useUserGeneratedLinkContext() {
  const context = useContext(UserGeneratedLinkContext)
  if (!context) {
    throw new Error("User-generated links must be rendered inside UserGeneratedLinkProvider.")
  }
  return context
}

export function UserGeneratedLinkProvider({ children }: { readonly children: ReactNode }) {
  const [pendingLink, setPendingLink] = useState<string | null>(null)

  function openPendingLink() {
    if (!pendingLink) return
    const destination = safeExternalUserGeneratedUrl(pendingLink)
    if (!destination) {
      setPendingLink(null)
      return
    }

    const url = new URL(destination)
    if (url.protocol === "mailto:") window.location.assign(url.toString())
    else window.open(url.toString(), "_blank", "noopener,noreferrer")
    setPendingLink(null)
  }

  return (
    <UserGeneratedLinkContext value={setPendingLink}>
      {children}
      <AlertDialog
        open={pendingLink !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLink(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open an external link?</AlertDialogTitle>
            <AlertDialogDescription>
              This link goes to{" "}
              {pendingLink ? externalLinkDestination(pendingLink) : "another site"}. External sites
              have their own privacy and security policies. The link will open in a new tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            <AlertDialogAction onClick={openPendingLink}>Open link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </UserGeneratedLinkContext>
  )
}

type UserGeneratedLinkProps = Omit<ComponentProps<"a">, "href" | "rel" | "target"> & {
  readonly href: string
  readonly relationship?: UserGeneratedLinkRelationship
}

export function UserGeneratedLink({
  href,
  relationship,
  onClick,
  children,
  className,
  ...props
}: UserGeneratedLinkProps) {
  const confirmExternalLink = useUserGeneratedLinkContext()
  const safeHref = safeUserGeneratedUrl(href)
  if (!safeHref) return <span className={className}>{children}</span>

  const externalHref = safeExternalUserGeneratedUrl(safeHref)
  if (!externalHref) {
    return (
      <a
        {...props}
        href={safeHref}
        rel={userGeneratedLinkRel(false, relationship)}
        className={className}
        onClick={onClick}
      >
        {children}
      </a>
    )
  }

  return (
    <a
      {...props}
      href={externalLinkWarningPath(externalHref)}
      target="_blank"
      rel={userGeneratedLinkRel(true, relationship)}
      className={className}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        event.preventDefault()
        confirmExternalLink(externalHref)
      }}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
