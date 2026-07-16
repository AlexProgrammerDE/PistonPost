import { createFileRoute } from "@tanstack/react-router"

import { FormPageSkeleton } from "@/components/LoadingStates"
import { PostComposer } from "@/components/post-composer"
import { getComposerViewer } from "@/server/composer-viewer"

export const Route = createFileRoute("/account/posts/new")({
  loader: () => getComposerViewer(),
  head: () => ({
    meta: [{ title: "New post · PistonPost" }, { name: "robots", content: "noindex" }],
  }),
  component: NewPost,
  pendingComponent: FormPageSkeleton,
})

function NewPost() {
  const viewer = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-10 border-b pb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Make a post</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Add some text, a set of pictures, or a video. You can check everything before posting.
        </p>
      </header>
      <PostComposer authenticated={viewer !== null} />
    </main>
  )
}
