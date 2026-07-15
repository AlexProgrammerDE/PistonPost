import { Skeleton } from "@pistonpost/ui/components/skeleton"

export function PasskeySkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 sm:p-6">
      <Skeleton className="size-10 rounded-md" />

      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  )
}
