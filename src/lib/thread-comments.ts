type ThreadedComment<T> = { readonly comment: T; readonly nested: boolean }

/**
 * Places each loaded reply directly below its parent, oldest reply first.
 * Replies whose parent is not loaded keep their position and are not indented,
 * so they never look attached to an unrelated comment.
 */
export function threadComments<T extends { readonly id: string; readonly parentId: string | null }>(
  comments: readonly T[],
): ThreadedComment<T>[] {
  const loadedIds = new Set(comments.map((comment) => comment.id))
  const repliesByParent = new Map<string, T[]>()
  for (const comment of comments) {
    if (!comment.parentId || !loadedIds.has(comment.parentId)) continue
    const replies = repliesByParent.get(comment.parentId) ?? []
    replies.unshift(comment)
    repliesByParent.set(comment.parentId, replies)
  }

  const threaded: ThreadedComment<T>[] = []
  for (const comment of comments) {
    if (comment.parentId && loadedIds.has(comment.parentId)) continue
    threaded.push({ comment, nested: false })
    for (const reply of repliesByParent.get(comment.id) ?? []) {
      threaded.push({ comment: reply, nested: true })
    }
  }
  return threaded
}
