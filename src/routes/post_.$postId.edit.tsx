import { useStore } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Schema } from "effect"
import { FilePenLine, Globe2, Link2, Save, Trash2, TriangleAlert } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { ImagePostEditor } from "@/components/ImagePostEditor"
import { FormPageSkeleton } from "@/components/LoadingStates"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Credenza,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "@/components/ui/credenza"
import { Field, FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard"
import { MAX_POST_MARKDOWN_LENGTH, postMarkdownSchema } from "@/domain"
import { useAppForm } from "@/lib/forms/app-form"
import { mediaImageUrl } from "@/lib/media-image"
import { ServerFunctionClientError } from "@/lib/server-function-error"
import { uploadPostEditImages, type EditablePostImage } from "@/lib/uploads/post-edit-images"
import { UploadClientError } from "@/lib/uploads/upload-client"
import { deletePost, getOwnedPostForEditing, updatePost } from "@/server/composer"

export const Route = createFileRoute("/post_/$postId/edit")({
  loader: async ({ params }) => {
    const id = Schema.decodeSync(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
      { errors: "all" },
    )(params.postId)
    return getOwnedPostForEditing({ data: { id } })
  },
  head: () => ({
    meta: [{ title: "Edit post · PistonPost" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: EditPostRoute,
  pendingComponent: FormPageSkeleton,
})

function EditPostRoute() {
  const post = Route.useLoaderData()
  return <EditPost key={post.id} post={post} />
}

function EditPost({ post }: { post: Awaited<ReturnType<typeof getOwnedPostForEditing>> }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const allowNavigationRef = useRef(false)
  const [preparingImages, setPreparingImages] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{
    filename: string
    progress: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const form = useAppForm({
    defaultValues: {
      title: post.title,
      textContent: post.textContent ?? "",
      tags: post.tags,
      visibility: post.visibility,
      images: post.images.map((image): EditablePostImage => ({
        clientId: image.id,
        id: image.id,
        filename: image.filename,
        altText: image.altText ?? "",
        previewUrl: mediaImageUrl(image.id, "detail"),
        file: null,
      })),
    },
    onSubmit: async ({ value }) => {
      setError(null)
      if (preparingImages) {
        setError("Wait for the images to finish cleaning.")
        return
      }
      if (post.type === "images" && value.images.length === 0) {
        setError("Keep at least one image before saving.")
        return
      }
      try {
        const images =
          post.type === "images"
            ? await uploadPostEditImages(post.id, value.images, {
                onReady: (clientId, id) =>
                  form.setFieldValue("images", (items) =>
                    items.map((item) => (item.clientId === clientId ? { ...item, id } : item)),
                  ),
                onProgress: (filename, progress) => setUploadProgress({ filename, progress }),
              })
            : undefined
        await updatePost({
          data: {
            id: post.id,
            version: post.version,
            title: value.title,
            textContent: post.type === "text" ? value.textContent : null,
            tags: value.tags,
            visibility: value.visibility,
            images,
          },
        })
        allowNavigationRef.current = true
        await queryClient.invalidateQueries({ queryKey: ["posts"] })
        toast.success("Post updated")
        await navigate({ to: "/post/$postId", params: { postId: post.id } })
      } catch (saveError) {
        setError(
          saveError instanceof ServerFunctionClientError || saveError instanceof UploadClientError
            ? saveError.message
            : "The post could not be updated. Reload the page and try again.",
        )
      } finally {
        setUploadProgress(null)
      }
    },
  })

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting)

  async function removePost() {
    setDeleting(true)
    setError(null)
    try {
      await deletePost({ data: { id: post.id, version: post.version } })
      allowNavigationRef.current = true
      await queryClient.invalidateQueries({ queryKey: ["posts"] })
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
            {(isDirty) => (
              <UnsavedChangesGuard
                allowNavigationRef={allowNavigationRef}
                enabled={isDirty || preparingImages || isSubmitting}
              />
            )}
          </form.Subscribe>
          <FieldSet disabled={isSubmitting || deleting}>
            <FieldLegend className="flex items-center gap-2">
              <FilePenLine aria-hidden="true" className="size-4 text-muted-foreground" />
              Content
            </FieldLegend>
            <FieldGroup>
              <form.AppField name="title">
                {(field) => <field.TextField label="Title" maxLength={100} />}
              </form.AppField>
              {post.type === "text" ? (
                <form.AppField
                  name="textContent"
                  validators={{
                    onBlur: Schema.toStandardSchemaV1(postMarkdownSchema, {
                      parseOptions: { errors: "all" },
                    }),
                  }}
                >
                  {(field) => (
                    <field.MarkdownField
                      label="Text"
                      description="GitHub-flavored Markdown is supported. Raw HTML is ignored."
                      maxLength={MAX_POST_MARKDOWN_LENGTH}
                    />
                  )}
                </form.AppField>
              ) : null}
              {post.type === "images" ? (
                <form.AppField name="images">
                  {(field) => (
                    <ImagePostEditor
                      images={field.state.value}
                      disabled={isSubmitting || deleting}
                      preparing={preparingImages}
                      onPreparing={setPreparingImages}
                      onChange={field.handleChange}
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
                  <field.ChoiceField
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

          {uploadProgress ? (
            <Progress value={uploadProgress.progress}>
              <ProgressLabel>Uploading {uploadProgress.filename}</ProgressLabel>
              <ProgressValue />
            </Progress>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Change not saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <FieldSeparator />
          <Field
            orientation="horizontal"
            className="flex-col items-stretch sm:flex-row sm:justify-between"
          >
            <Credenza>
              <CredenzaTrigger
                render={
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isSubmitting || preparingImages || deleting}
                  />
                }
              >
                <Trash2 aria-hidden="true" data-icon="inline-start" />
                Delete post
              </CredenzaTrigger>
              <CredenzaContent>
                <CredenzaHeader>
                  <CredenzaTitle>Delete this post?</CredenzaTitle>
                  <CredenzaDescription>
                    Public access stops immediately. Images, video, comments, hearts, and tag links
                    are then removed through the cleanup queue.
                  </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaFooter>
                  <CredenzaClose render={<Button variant="outline" />} disabled={deleting}>
                    Keep post
                  </CredenzaClose>
                  <Button
                    variant="destructive"
                    disabled={deleting}
                    onClick={() => void removePost()}
                  >
                    {deleting ? (
                      <Spinner aria-hidden="true" data-icon="inline-start" />
                    ) : (
                      <Trash2 aria-hidden="true" data-icon="inline-start" />
                    )}
                    {deleting ? "Deleting…" : "Delete post"}
                  </Button>
                </CredenzaFooter>
              </CredenzaContent>
            </Credenza>
            <form.SubmitButton disabled={deleting || preparingImages}>
              <Save aria-hidden="true" data-icon="inline-start" />
              Save changes
            </form.SubmitButton>
          </Field>
        </form.AppForm>
      </form>
      <Separator className="mt-10" />
    </main>
  )
}
