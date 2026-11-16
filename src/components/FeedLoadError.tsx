import { useQueryErrorResetBoundary } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Newspaper, RotateCcw, TriangleAlert } from "lucide-react"
import { useEffect, type ReactElement } from "react"

import { ButtonLink } from "@/components/ButtonLink"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export function FeedLoadErrorAlert({
  latestLink,
  onRetry,
}: {
  /** A link to the newest page of this feed. Pass it only when the failed page is an older page. */
  readonly latestLink?: ReactElement
  readonly onRetry: () => void
}) {
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>
        {latestLink ? "These older posts could not be loaded" : "The feed could not be loaded"}
      </AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-4">
        <span>
          {latestLink
            ? "The link may be out of date. Go back to the latest posts or try again."
            : "Check your connection and try again."}
        </span>
        <div className="flex flex-wrap gap-2">
          {latestLink ? (
            <ButtonLink render={latestLink}>
              <Newspaper aria-hidden="true" data-icon="inline-start" />
              Latest posts
            </ButtonLink>
          ) : null}
          <Button variant="outline" onClick={onRetry}>
            <RotateCcw aria-hidden="true" data-icon="inline-start" />
            Try again
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

export function FeedLoadError({ latestLink }: { readonly latestLink?: ReactElement }) {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()

  useEffect(() => {
    queryErrorResetBoundary.reset()
  }, [queryErrorResetBoundary])

  function retry() {
    queryErrorResetBoundary.reset()
    void router.invalidate()
  }

  return <FeedLoadErrorAlert latestLink={latestLink} onRetry={retry} />
}
