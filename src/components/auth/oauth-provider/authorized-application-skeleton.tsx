"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function AuthorizedApplicationSkeleton() {
  return (
    <Card className="border-0 bg-transparent shadow-none ring-0">
      <CardContent className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-md" />

        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />

          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
