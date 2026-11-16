import { useQueryErrorResetBoundary } from "@tanstack/react-query"
import { Link, useRouter } from "@tanstack/react-router"
import { House, RotateCcw, TriangleAlert } from "lucide-react"
import { useEffect } from "react"

import { ButtonLink } from "@/components/ButtonLink"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"

/**
 * The page-level error view. The root route and the router default both use it, so a route without
 * its own error view never falls back to the framework's built-in error page.
 */
export function RouteError() {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()

  useEffect(() => {
    queryErrorResetBoundary.reset()
  }, [queryErrorResetBoundary])

  function retry() {
    queryErrorResetBoundary.reset()
    void router.invalidate()
  }

  return (
    <main className="mx-auto grid min-h-[65svh] w-full max-w-3xl place-items-center px-4 py-16">
      <Alert variant="destructive" className="w-full max-w-xl">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>
          <h1>We couldn’t load this page</h1>
        </AlertTitle>
        <AlertDescription className="grid gap-4">
          <span>Try again. If the problem continues, return to the latest posts.</span>
          <ButtonGroup aria-label="Page recovery actions">
            <Button onClick={retry}>
              <RotateCcw aria-hidden="true" data-icon="inline-start" />
              Try again
            </Button>
            <ButtonLink variant="outline" render={<Link to="/" />}>
              <House aria-hidden="true" data-icon="inline-start" />
              Go home
            </ButtonLink>
          </ButtonGroup>
        </AlertDescription>
      </Alert>
    </main>
  )
}
