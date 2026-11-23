import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { useSelector } from "@tanstack/react-store"
import { Option, Schema } from "effect"
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
import { Spinner } from "@/components/ui/spinner"
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard"
import { MAX_POST_MARKDOWN_LENGTH } from "@/domain/validation"
import { useAppForm } from "@/lib/forms/app-form"
import { mediaImageUrl } from "@/lib/media-image"
import { ownedRouteFailure } from "@/lib/owned-route-failure"
import { readingPageClassName } from "@/lib/page-layout"
import { refreshAfterPostChange } from "@/lib/queries/posts"
import { ServerFunctionClientError } from "@/lib/server-function-error"
import { uploadPostEditImages, type EditablePostImage } from "@/lib/uploads/post-edit-images"
import { UploadClientError } from "@/lib/uploads/upload-client"
import { deletePost, getOwnedPostForEditing, updatePost } from "@/server/composer"

const titleSchema = Schema.Trim.check(Schema.isMinLength(1, { message: "Add a title." })).check(
  Schema.isMaxLength(100, { message: "Use 100 characters or fewer." }),
)
const textSchema = Schema.Trim.check(
  Schema.isMinLength(1, { message: "Write something before saving." }),
).check(
  Schema.isMaxLength(MAX_POST_MARKDOWN_LENGTH, { message: "Use 10,000 characters or fewer." }),
)
const tagsSchema = Schema.mutable(Schema.Array(Schema.String))
  .check(Schema.isMinLength(1, { message: "Add at least one tag." }))
  .check(Schema.isMaxLength(5, { message: "Use at most five tags." }))

function focusFirstInvalidField(formElement: HTMLFormElement) {
  const invalid = formElement.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (!invalid) return
  const target = invalid.matches("input, textarea, select, button")
    ? invalid
    : invalid.querySelector<HTMLElement>("input, textarea, select, button")
  target?.focus()
}

const decodePostIdParam = Schema.decodeUnknownOption(
  Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
)

export const Route = createFileRoute("/post_/$postId/edit")({
  loader: async ({ params, location }) => {
    const id = decodePostIdParam(params.postId)
    if (Option.isNone(id)) throw notFound()
    try {
      return await getOwnedPostForEditing({ data: { id: id.value } })
    } catch (error) {
      throw ownedRouteFailure(error, location.href)
    }
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
                onReady: (clientId, id) => {
                  form.setFieldValue("images", (items) =>
                    items.map((item) => (item.clientId === clientId ? { ...item, id } : item)),
                  )
                },
                onProgress: (filename, progress) => {
                  setUploadProgress({ filename, progress })
                },
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
        await refreshAfterPostChange(queryClient, post.id)
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

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting)

  async function removePost() {
    setDeleting(true)
    setError(null)
    try {
      await deletePost({ data: { id: post.id, version: post.version } })
      allowNavigationRef.current = true
      await refreshAfterPostChange(queryClient, post.id)
      toast.success("Post deleted")
      await navigate({ to: "/" })
    } catch {
      // The confirmation dialog covers the page alert, so report the failure where it is visible.
      toast.error("The post could not be deleted. Try again.")
      setError("The post could not be deleted. Try again.")
      setDeleting(false)
    }
  }

  return (
    <main className={readingPageClassName}>
      <header className="mb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Edit post</h1>
        <p className="mt-1 text-sm/6 text-muted-foreground">
          If you change this post somewhere else while editing, saving here stops instead of
          overwriting it.
        </p>
      </header>

      <form
        className="grid gap-6"
        onSubmit={(event) => {
          event.preventDefault()
          const formElement = event.currentTarget
          void (async () => {
            await form.handleSubmit()
            if (form.state.isValid) return
            requestAnimationFrame(() => {
              focusFirstInvalidField(formElement)
            })
          })()
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
              <form.AppField
                name="title"
                validators={{
                  onBlur: Schema.toStandardSchemaV1(titleSchema, {
                    parseOptions: { errors: "all" },
                  }),
                }}
              >
                {(field) => <field.TextField label="Title" maxLength={100} />}
              </form.AppField>
              {post.type === "text" ? (
                <form.AppField
                  name="textContent"
                  validators={{
                    onBlur: Schema.toStandardSchemaV1(textSchema, {
                      parseOptions: { errors: "all" },
                    }),
                  }}
                >
                  {(field) => (
                    <field.MarkdownField label="Text" maxLength={MAX_POST_MARKDOWN_LENGTH} />
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
              <form.AppField
                name="tags"
                validators={{
                  onBlur: Schema.toStandardSchemaV1(tagsSchema, {
                    parseOptions: { errors: "all" },
                  }),
                }}
              >
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
                    description="Unlisted means anyone with the link can view it. It is not private."
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
    </main>
  )
}
