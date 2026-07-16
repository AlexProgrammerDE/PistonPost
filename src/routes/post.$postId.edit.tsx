import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FilePenLine, Globe2, Link2, Save, Trash2, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { FormPageSkeleton } from "@/components/LoadingStates"
import { AuthenticationProvider } from "@/components/providers"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard"
import { MAX_POST_MARKDOWN_LENGTH, postMarkdownSchema } from "@/domain"
import { useAppForm } from "@/lib/forms/app-form"
import { deletePost, getOwnedPostForEditing, updatePost } from "@/server/composer"
import { getPublicRuntimeConfig } from "@/server/public-config"

export const Route = createFileRoute("/post/$postId/edit")({
  loader: async ({ params }) => {
    const id = z.string().min(1).max(64).parse(params.postId)
    const [post, config] = await Promise.all([
      getOwnedPostForEditing({ data: { id } }),
      getPublicRuntimeConfig(),
    ])
    return { post, config }
  },
  head: () => ({
    meta: [{ title: "Edit post · PistonPost" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: EditPostRoute,
  pendingComponent: FormPageSkeleton,
})

function EditPostRoute() {
  const { queryClient } = Route.useRouteContext()
  const { post, config } = Route.useLoaderData()
  return (
    <AuthenticationProvider queryClient={queryClient} turnstileSiteKey={config.turnstileSiteKey}>
      <EditPost post={post} />
    </AuthenticationProvider>
  )
}

function EditPost({ post }: { post: Awaited<ReturnType<typeof getOwnedPostForEditing>> }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const form = useAppForm({
    defaultValues: {
      title: post.title,
      textContent: post.textContent ?? "",
      tags: post.tags,
      visibility: post.visibility,
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await updatePost({
          data: {
            id: post.id,
            version: post.version,
            title: value.title,
            textContent: post.type === "text" ? value.textContent : null,
            tags: value.tags,
            visibility: value.visibility,
          },
        })
        toast.success("Post updated")
        await navigate({ to: "/post/$postId", params: { postId: post.id } })
      } catch {
        setError("The post could not be updated. Reload the page and try again.")
      }
    },
  })

  async function removePost() {
    setDeleting(true)
    setError(null)
    try {
      await deletePost({ data: { id: post.id, version: post.version } })
      toast.success("Post deleted")
      await navigate({ to: "/" })
    } catch {
      setError("The post could not be deleted. Try again.")
      setDeleting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
      <header className="typeset typeset-post mb-10 border-b pb-7">
        <h1>Edit post</h1>
        <p>
          If this post changes in another session while you are editing, we will stop before
          overwriting it.
        </p>
      </header>

      <form
        className="grid gap-8"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.AppForm>
          <form.Subscribe selector={(state) => state.isDirty}>
            {(isDirty) => <UnsavedChangesGuard enabled={isDirty} />}
          </form.Subscribe>
          <FieldSet>
            <FieldLegend className="flex items-center gap-2">
              <FilePenLine aria-hidden="true" className="size-4 text-muted-foreground" />
              Content
            </FieldLegend>
            <FieldGroup>
              <form.AppField name="title">
                {(field) => <field.TextField label="Title" maxLength={100} />}
              </form.AppField>
              {post.type === "text" ? (
                <form.AppField name="textContent" validators={{ onBlur: postMarkdownSchema }}>
                  {(field) => (
                    <field.MarkdownField
                      label="Text"
                      description="GitHub-flavored Markdown is supported. Raw HTML is ignored."
                      maxLength={MAX_POST_MARKDOWN_LENGTH}
                    />
                  )}
                </form.AppField>
              ) : null}
              <form.AppField name="tags">
                {(field) => (
                  <field.TagsField
                    label="Tags"
                    description="Add 1 to 5 tags. Press Enter, type a comma, or choose Add."
                  />
                )}
              </form.AppField>
              <form.AppField name="visibility">
                {(field) => (
                  <field.SelectField
                    label="Visibility"
                    description="Unlisted posts remain accessible to anyone holding the link."
                    options={[
                      { icon: Globe2, label: "Public", value: "public" },
                      { icon: Link2, label: "Unlisted", value: "unlisted" },
                    ]}
                  />
                )}
              </form.AppField>
            </FieldGroup>
          </FieldSet>

          {error ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Change not saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button" variant="destructive" />}>
                <Trash2 aria-hidden="true" data-icon="inline-start" />
                Delete post
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this post?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Public access stops immediately. Images, video, comments, reactions, and tag
                    links are then removed through the cleanup queue.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep post</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={deleting}
                    onClick={() => void removePost()}
                  >
                    {deleting ? null : <Trash2 aria-hidden="true" data-icon="inline-start" />}
                    {deleting ? "Deleting…" : "Delete post"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <form.SubmitButton>
              <Save aria-hidden="true" data-icon="inline-start" />
              Save changes
            </form.SubmitButton>
          </div>
        </form.AppForm>
      </form>
      <Separator className="mt-10" />
    </main>
  )
}
