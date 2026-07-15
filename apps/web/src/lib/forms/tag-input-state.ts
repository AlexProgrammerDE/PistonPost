export function addTagInputValues(current: ReadonlyArray<string>, rawInput: string, limit = 5) {
  const next = [...current]
  const normalized = new Set(next.map((tag) => tag.toLocaleLowerCase("en-US")))

  for (const candidate of rawInput.split(/[,\n]/u)) {
    const tag = candidate.trim().replace(/^#/, "")
    const identity = tag.toLocaleLowerCase("en-US")
    if (!tag || normalized.has(identity) || next.length >= limit) continue
    next.push(tag)
    normalized.add(identity)
  }

  return next
}
