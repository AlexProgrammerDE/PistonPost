import { Field, FieldGroup } from "@/components/ui/field"
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia } from "@/components/ui/item"
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
    <Timeline className="gap-0 [--timeline-connector-thickness:0.0625rem] [--timeline-dot-size:2.25rem] sm:[--timeline-dot-size:2.75rem]">
      {generateN(3).map((identity) => (
        <TimelineItem
          key={identity}
          id={`timeline-placeholder-${identity}`}
          className="gap-3 pb-10 sm:gap-4"
        >
          <TimelineDot>
            <Skeleton className="size-8 rounded-full sm:size-10" />
          </TimelineDot>
          <TimelineConnector />
          <TimelineContent className="min-w-0">
            <article className="grid gap-4">
              <div className="grid min-h-8 content-center gap-2 sm:min-h-10">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="aspect-[4/3] w-full" />
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-14" />
                </div>
                <div className="grid grid-cols-3 gap-1 border-t pt-2 sm:flex">
                  <Skeleton className="h-11 w-full sm:h-8 sm:w-20" />
                  <Skeleton className="h-11 w-full sm:h-8 sm:w-24" />
                  <Skeleton className="h-11 w-full sm:h-8 sm:w-24" />
                </div>
              </div>
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
        <Skeleton className="h-8 w-16" />
      </div>
      <div className="mt-10 grid gap-8">
        <Skeleton className="h-8 w-32" />
        <FieldGroup className="gap-3">
          <Field>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-32 w-full" />
          </Field>
        </FieldGroup>
        <ItemGroup className="gap-0 border-y">
          {generateN(2).map((identity) => (
            <Item
              key={identity}
              role="listitem"
              variant="outline"
              className="items-start rounded-none border-x-0 border-t-0 px-0 py-5 last:border-b-0"
            >
              <ItemMedia>
                <Skeleton className="size-10 rounded-full" />
              </ItemMedia>
              <ItemContent className="min-w-0 gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-full" />
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
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
      <Skeleton className="h-8 w-16" />
    </LoadingRegion>
  )
}

export function CommentComposerSkeleton() {
  return (
    <LoadingRegion label="Loading comment controls…">
      <FieldGroup>
        <Field>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-32 w-full" />
        </Field>
      </FieldGroup>
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
        <ItemGroup className="gap-0 border-y">
          {generateN(5).map((identity) => (
            <Item
              key={identity}
              role="listitem"
              variant="outline"
              className="rounded-none border-x-0 border-t-0 px-0 py-5 last:border-b-0"
            >
              <ItemContent className="min-w-0 gap-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-80 max-w-full" />
              </ItemContent>
              <ItemActions>
                <Skeleton className="h-8 w-20" />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
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
        <FieldGroup>
          {generateN(4).map((identity) => (
            <Field key={identity}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className={identity === 2 ? "h-28 w-full" : "h-10 w-full"} />
            </Field>
          ))}
          <Field orientation="horizontal" className="justify-end">
            <Skeleton className="h-9 w-28" />
          </Field>
        </FieldGroup>
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
    <div className="flex max-w-3xl flex-col gap-6">
      <Skeleton className="h-7 w-40" />
      <FieldGroup className="gap-6">
        {generateN(3).map((identity) => (
          <Field key={identity}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </Field>
        ))}
      </FieldGroup>
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
        <ItemGroup className="gap-0 border-y">
          {generateN(6).map((identity) => (
            <Item
              key={identity}
              role="listitem"
              variant="outline"
              className="rounded-none border-x-0 border-t-0 px-1 py-5 last:border-b-0 sm:px-3"
            >
              <ItemContent className="min-w-0 gap-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-80 max-w-full" />
              </ItemContent>
              <ItemActions>
                <Skeleton className="h-5 w-10" />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
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
        <FieldGroup className="gap-5">
          {generateN(3).map((identity) => (
            <Field key={identity}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </Field>
          ))}
          <Field>
            <Skeleton className="h-10 w-full" />
          </Field>
        </FieldGroup>
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
