import { useRouter } from "@tanstack/react-router"
import { RotateCcw, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"

import { AdminSectionNav } from "@/components/AdminSectionNav"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { AdminDestination } from "@/lib/admin-sections"
import { widePageClassName } from "@/lib/page-layout"

/**
 * The shared frame for every administration screen: section tabs first, then the page content.
 * The upstream Better Auth users screen brings its own heading, so the heading is a separate
 * piece that matches that heading's size and spacing.
 */
export function AdminPage({
  current,
  children,
}: {
  current: AdminDestination
  children: ReactNode
}) {
  return (
    <main className={widePageClassName}>
      <AdminSectionNav className="mb-6" current={current} />
      <div className="flex flex-col gap-6">{children}</div>
    </main>
  )
}

export function AdminPageHeader({
  title,
  description,
}: {
  title: ReactNode
  description: ReactNode
}) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
    </header>
  )
}

/** Keeps the admin tabs usable when one screen's data fails to load. */
export function AdminLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>We couldn’t load this section</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>Try again, or switch to another section while the problem is fixed.</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden="true" data-icon="inline-start" />
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/** Route error view for admin screens whose loader failed. */
export function AdminRouteError({
  current,
  title,
  description,
}: {
  current: AdminDestination
  title: string
  description: string
}) {
  const router = useRouter()
  return (
    <AdminPage current={current}>
      <AdminPageHeader title={title} description={description} />
      <AdminLoadError
        onRetry={() => {
          void router.invalidate()
        }}
      />
    </AdminPage>
  )
}
