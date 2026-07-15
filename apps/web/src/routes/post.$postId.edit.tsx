import { Alert, AlertDescription, AlertTitle } from "@pistonpost/ui/components/alert"
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
} from "@pistonpost/ui/components/alert-dialog"
import { Button } from "@pistonpost/ui/components/button"
import { FieldGroup, FieldLegend, FieldSet } from "@pistonpost/ui/components/field"
import { Separator } from "@pistonpost/ui/components/separator"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { Trash2, TriangleAlert } from "@/components/icons"
import { AuthenticationProvider } from "@/components/providers"
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard"
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
    meta: [{ title: "Edit post · PistonPost" }, { name: "robots", content: "noindex" }],
  }),
  component: EditPostRoute,
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
      <header className="typeset mb-10 border-b pb-7">
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
            <FieldLegend>Content</FieldLegend>
            <FieldGroup>
              <form.AppField name="title">
                {(field) => <field.TextField label="Title" maxLength={100} />}
              </form.AppField>
              {post.type === "text" ? (
                <form.AppField name="textContent">
                  {(field) => <field.TextareaField label="Text" rows={9} maxLength={1_000} />}
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
                      { label: "Public", value: "public" },
                      { label: "Unlisted", value: "unlisted" },
                    ]}
                  />
                )}
              </form.AppField>
            </FieldGroup>
          </FieldSet>

          {error ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Change not saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button" variant="destructive" />}>
                <Trash2 data-icon="inline-start" />
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
                    {deleting ? "Deleting…" : "Delete post"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <form.SubmitButton>Save changes</form.SubmitButton>
          </div>
        </form.AppForm>
      </form>
      <Separator className="mt-10" />
    </main>
  )
}
