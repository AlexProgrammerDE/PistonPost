const MAX_TAG_LENGTH = 64

function normalizeTagInputValue(value: string) {
  return value
    .trim()
    .replace(/^#+/u, "")
    .replace(/[^A-Za-z0-9._~-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, MAX_TAG_LENGTH)
}

export function addTagInputValues(current: ReadonlyArray<string>, rawInput: string, limit = 5) {
  const next = [...current]
  const normalized = new Set(next.map((tag) => tag.toLocaleLowerCase("en-US")))

  for (const candidate of rawInput.split(/[,\n]/u)) {
    const tag = normalizeTagInputValue(candidate)
    const identity = tag.toLocaleLowerCase("en-US")
    if (!tag || normalized.has(identity) || next.length >= limit) continue
    next.push(tag)
    normalized.add(identity)
  }

  return next
}
