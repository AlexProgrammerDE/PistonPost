import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineItem,
} from "@/components/ui/timeline"
import { generateN } from "@/lib/generate-n"

function LoadingRegion({
  children,
  label,
  className,
}: {
  readonly children: React.ReactNode
  readonly label: string
  readonly className?: string
}) {
  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="contents" aria-hidden="true">
        {children}
      </div>
    </div>
  )
}

function FeedItemsPlaceholder() {
  return (
    <Timeline className="gap-0">
      {generateN(3).map((identity) => (
        <TimelineItem key={identity} id={`timeline-placeholder-${identity}`} className="gap-4">
          <TimelineDot className="mt-3" />
          <TimelineConnector className="top-6" />
          <TimelineContent className="min-w-0">
            <article className="grid gap-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="aspect-[4/3] w-full" />
              <Skeleton className="h-5 w-40" />
            </article>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  )
}

export function FeedItemsSkeleton() {
  return (
    <LoadingRegion label="Loading posts…">
      <FeedItemsPlaceholder />
    </LoadingRegion>
  )
}

export function FeedPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <LoadingRegion label="Loading feed…">
        <header className="mb-7">
          <Skeleton className="h-8 w-28" />
        </header>
        <FeedItemsPlaceholder />
      </LoadingRegion>
    </main>
  )
}

export function ProfilePageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <LoadingRegion label="Loading profile…">
        <header className="mb-10 grid gap-5 border-b pb-7 sm:grid-cols-[auto_1fr] sm:items-center">
          <Skeleton className="size-20 rounded-full sm:size-24" />
          <div className="grid gap-3">
            <Skeleton className="h-10 w-56 max-w-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-full max-w-lg" />
            <Skeleton className="h-4 w-48" />
          </div>
        </header>
        <FeedItemsPlaceholder />
      </LoadingRegion>
    </main>
  )
}

function DiscussionPlaceholder() {
  return (
    <div className="mx-auto mt-5 max-w-5xl">
      <div className="flex items-center justify-between gap-3 border-y py-3">
        <Skeleton className="h-8 w-28" />
        <div className="flex gap-2">
          {generateN(3).map((identity) => (
            <Skeleton key={identity} className="h-8 w-16" />
          ))}
        </div>
      </div>
      <div className="mt-10 grid gap-8">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full" />
        {generateN(2).map((identity) => (
          <div key={identity} className="grid grid-cols-[auto_1fr] gap-3 border-b py-5">
            <Skeleton className="size-10 rounded-full" />
            <div className="grid gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PostDetailSkeleton() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <LoadingRegion label="Loading post…" className="grid gap-5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <Skeleton className="h-12 w-4/5" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="aspect-[16/10] w-full" />
        <div className="flex gap-2">
          {generateN(3).map((identity) => (
            <Skeleton key={identity} className="h-6 w-16" />
          ))}
        </div>
        <DiscussionPlaceholder />
      </LoadingRegion>
    </main>
  )
}

export function DiscussionSkeleton() {
  return (
    <LoadingRegion label="Loading discussion…">
      <DiscussionPlaceholder />
    </LoadingRegion>
  )
}

export function DiscussionViewerSkeleton() {
  return (
    <LoadingRegion label="Loading your discussion controls…">
      <Skeleton className="h-8 w-56" />
    </LoadingRegion>
  )
}

export function CommentComposerSkeleton() {
  return (
    <LoadingRegion label="Loading comment controls…" className="grid gap-3">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="ml-auto h-9 w-32" />
    </LoadingRegion>
  )
}

export function ManagementPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <LoadingRegion label="Loading your posts…">
        <header className="mb-8 grid gap-3 border-b pb-6">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </header>
        <div className="border-y">
          {generateN(5).map((identity) => (
            <div
              key={identity}
              className="grid gap-4 border-b py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="grid gap-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-80 max-w-full" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </LoadingRegion>
    </main>
  )
}

export function FormPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <LoadingRegion label="Loading form…">
        <header className="mb-10 grid gap-3 border-b pb-6">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </header>
        <div className="grid gap-7">
          {generateN(4).map((identity) => (
            <div key={identity} className="grid gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className={identity === 2 ? "h-28 w-full" : "h-10 w-full"} />
            </div>
          ))}
          <Skeleton className="ml-auto h-9 w-28" />
        </div>
      </LoadingRegion>
    </main>
  )
}

export function SettingsLayoutSkeleton() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <LoadingRegion label="Loading account settings…">
        <header className="mb-8 grid gap-3 border-b pb-6">
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </header>
        <div className="mb-8 flex gap-3 overflow-hidden border-b pb-3">
          {generateN(5).map((identity) => (
            <Skeleton key={identity} className="h-5 w-24 shrink-0" />
          ))}
        </div>
        <SettingsPanelPlaceholder />
      </LoadingRegion>
    </main>
  )
}

function SettingsPanelPlaceholder() {
  return (
    <div className="grid max-w-3xl gap-6">
      <Skeleton className="h-7 w-40" />
      {generateN(3).map((identity) => (
        <div key={identity} className="grid gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  )
}

export function SettingsPanelSkeleton() {
  return (
    <LoadingRegion label="Loading settings panel…">
      <SettingsPanelPlaceholder />
    </LoadingRegion>
  )
}

export function AdminOverviewSkeleton() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <LoadingRegion label="Loading administration overview…">
        <header className="mb-8 grid gap-3 border-b pb-6">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </header>
        <div className="border-y">
          {generateN(6).map((identity) => (
            <div
              key={identity}
              className="grid gap-3 border-b px-1 py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-3"
            >
              <div className="grid gap-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-80 max-w-full" />
              </div>
              <Skeleton className="h-5 w-10" />
            </div>
          ))}
        </div>
      </LoadingRegion>
    </main>
  )
}

export function AdminTablePageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <LoadingRegion label="Loading administration data…">
        <header className="mb-6 grid gap-3 border-b pb-6">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </header>
        <div className="mb-6 flex gap-5 overflow-hidden border-b pb-3">
          {generateN(7).map((identity) => (
            <Skeleton key={identity} className="h-5 w-20 shrink-0" />
          ))}
        </div>
        <Skeleton className="mb-5 h-10 w-full max-w-sm" />
        <div className="border-y">
          {generateN(7).map((identity) => (
            <div key={identity} className="grid grid-cols-4 gap-4 border-b px-3 py-4">
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
            </div>
          ))}
        </div>
      </LoadingRegion>
    </main>
  )
}

export function AuthPageSkeleton() {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-8rem)] w-full max-w-md items-center px-5 py-12 sm:px-0">
      <LoadingRegion label="Loading account access…" className="grid w-full gap-6">
        <Skeleton className="mx-auto h-9 w-44" />
        <div className="grid gap-5">
          {generateN(3).map((identity) => (
            <div key={identity} className="grid gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-full" />
        </div>
      </LoadingRegion>
    </main>
  )
}

export function LightboxLoadingFallback() {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/95"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Spinner aria-hidden="true" />
        <span>Opening image…</span>
      </div>
    </div>
  )
}
