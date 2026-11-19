const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const RELATIVE_CUTOFF_MS = 7 * DAY_MS

const relativeTimeFormat = new Intl.RelativeTimeFormat("en", { numeric: "always" })

function dateTimeFormat(
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en", timeZone ? { ...options, timeZone } : options)
}

export function formatAbsoluteDate(value: Date, timeZone?: string) {
  return dateTimeFormat(
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    },
    timeZone,
  ).format(value)
}

export function formatAbsoluteDateTime(value: Date, timeZone?: string) {
  return dateTimeFormat(
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    },
    timeZone,
  ).format(value)
}

export function formatRelativeDateTime(value: Date, now: Date, timeZone?: string) {
  const elapsed = Math.max(0, now.getTime() - value.getTime())

  if (elapsed < MINUTE_MS) return "just now"
  if (elapsed < HOUR_MS) {
    return relativeTimeFormat.format(-Math.floor(elapsed / MINUTE_MS), "minute")
  }
  if (elapsed < DAY_MS) {
    return relativeTimeFormat.format(-Math.floor(elapsed / HOUR_MS), "hour")
  }
  if (elapsed < RELATIVE_CUTOFF_MS) {
    return relativeTimeFormat.format(-Math.floor(elapsed / DAY_MS), "day")
  }

  const valueYear = dateTimeFormat({ year: "numeric" }, timeZone).format(value)
  const currentYear = dateTimeFormat({ year: "numeric" }, timeZone).format(now)

  return dateTimeFormat(
    {
      year: valueYear === currentYear ? undefined : "numeric",
      month: "short",
      day: "numeric",
    },
    timeZone,
  ).format(value)
}
