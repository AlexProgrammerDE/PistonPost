"use client"

import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react"

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
      <Credenza
        open={pendingLink !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLink(null)
        }}
      >
        <CredenzaContent>
          <CredenzaHeader>
            <CredenzaTitle>Open an external link?</CredenzaTitle>
            <CredenzaDescription>
              This link goes to{" "}
              {pendingLink ? externalLinkDestination(pendingLink) : "another site"}. External sites
              have their own privacy and security policies. The link will open in a new tab.
            </CredenzaDescription>
          </CredenzaHeader>
          <CredenzaFooter>
            <CredenzaClose render={<Button variant="outline" />}>Stay here</CredenzaClose>
            <Button onClick={openPendingLink}>Open link</Button>
          </CredenzaFooter>
        </CredenzaContent>
      </Credenza>
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
