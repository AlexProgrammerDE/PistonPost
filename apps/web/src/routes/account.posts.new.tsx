import { createFileRoute } from "@tanstack/react-router"

import { PostComposer } from "@/components/post-composer"
import { getComposerViewer } from "@/server/composer-viewer"

export const Route = createFileRoute("/account/posts/new")({
  loader: () => getComposerViewer(),
  head: () => ({
    meta: [{ title: "New post · PistonPost" }, { name: "robots", content: "noindex" }],
  }),
  component: NewPost,
})

function NewPost() {
  const viewer = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-20">
      <div className="mb-12 grid gap-5 border-b pb-8 md:grid-cols-[minmax(0,1fr)_17rem] md:items-end">
        <div className="typeset">
          <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Composer</p>
          <h1>Start a new transmission</h1>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Set the story first. Media uploads begin only when you publish, and failed work remains a
          draft.
        </p>
      </div>
      <PostComposer authenticated={viewer !== null} />
    </main>
  )
}
