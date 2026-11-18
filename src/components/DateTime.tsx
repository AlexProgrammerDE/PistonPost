"use client"

import { useSyncExternalStore } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { clockStore } from "@/lib/clock-store"
import {
  formatAbsoluteDate,
  formatAbsoluteDateTime,
  formatRelativeDateTime,
} from "@/lib/date-time-format"
import { cn } from "@/lib/utils"

type DateTimePresentation = "absolute" | "relative"

export function DateTime({
  value,
  presentation = "relative",
  className,
}: {
  readonly value: Date
  readonly presentation?: DateTimePresentation
  readonly className?: string
}) {
  const now = useSyncExternalStore(
    clockStore.subscribe,
    clockStore.getSnapshot,
    clockStore.getServerSnapshot,
  )
  const exact = formatAbsoluteDateTime(value, now === null ? "UTC" : undefined)
  const label =
    presentation === "relative" && now !== null
      ? formatRelativeDateTime(value, new Date(now))
      : formatAbsoluteDate(value, now === null ? "UTC" : undefined)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <time
            dateTime={value.toISOString()}
            aria-label={`${label}. ${exact}`}
            className={cn("cursor-help", className)}
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent>{exact}</TooltipContent>
    </Tooltip>
  )
}
