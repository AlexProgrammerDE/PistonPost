"use client"

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { type QueryClient, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { GripVertical, Trash2, TriangleAlert, Upload } from "lucide-react"
import { useEffect, useReducer, useRef, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard"
import { postDraftInputSchema } from "@/domain"
import { useAppForm } from "@/lib/forms/app-form"
import { ownedMediaStatusQueryOptions } from "@/lib/queries/media"
import {
  createUploadItem,
  mediaUploadReducer,
  releaseUploadPreviews,
  type UploadItem,
} from "@/lib/uploads/media-upload-state"
import { UploadClientError, uploadImage, uploadVideo } from "@/lib/uploads/upload-client"
import {
  abortMediaUpload,
  createImageUploadIntents,
  createPostDraft,
  createVideoUploadIntent,
  publishPost,
} from "@/server/composer"

const titleSchema = z
  .string()
  .trim()
  .min(1, "Add a title.")
  .max(100, "Use 100 characters or fewer.")
const textSchema = z
  .string()
  .trim()
  .min(1, "Write something before posting.")
  .max(1_000, "Use 1,000 characters or fewer.")
const tagsSchema = z
  .array(z.string())
  .min(1, "Add at least one tag.")
  .max(5, "Use at most five tags.")
const imageMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"])

type ComposerValues = {
  type: "text" | "images" | "video"
  title: string
  textContent: string
  tags: string[]
  visibility: "public" | "unlisted"
  mediaIds: string[]
  mediaId: string | null
}

const defaultValues: ComposerValues = {
  type: "text",
  title: "",
  textContent: "",
  tags: [],
  visibility: "public",
  mediaIds: [],
  mediaId: null,
}

const composerMessages = new Set([
  "Choose at least one image.",
  "Choose a video.",
  "Too many uploads were started at once. Wait a minute and try again.",
  "The account media quota was reached.",
  "A new post can contain at most 20 images.",
  "The image upload could not be started.",
  "Large video uploads are not configured yet. Try a video under 200 MB.",
  "The video upload could not be started. Try again.",
  "Media is still processing.",
  "Video processing is taking longer than expected. The draft is still saved.",
  "The video could not be processed.",
])

function readableError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check the post details."
  if (error instanceof UploadClientError) return error.message
  if (error instanceof Error && composerMessages.has(error.message)) return error.message
  return "The post could not be posted. Try again."
}

async function waitForVideo(queryClient: QueryClient, assetId: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    // Polling must remain ordered so each check observes the latest Stream state.
    // eslint-disable-next-line no-await-in-loop
    const [asset] = await queryClient.fetchQuery(ownedMediaStatusQueryOptions([assetId]))
    if (asset?.status === "ready") return
    if (asset?.status === "failed" || asset?.status === "deleted") {
      throw new Error("The video could not be processed.")
    }
    // The delay is part of the bounded reconciliation protocol.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
  throw new Error("Video processing is taking longer than expected. The draft is still saved.")
}

export function PostComposer({ authenticated }: { authenticated: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [uploads, dispatch] = useReducer(mediaUploadReducer, [])
  const uploadsRef = useRef(uploads)
  const uploadControllers = useRef(new Map<string, AbortController>())
  const [submitError, setSubmitError] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setSubmitError(null)
      try {
        const draftInput = postDraftInputSchema.parse(
          value.type === "text"
            ? {
                type: "text",
                title: value.title,
                textContent: value.textContent,
                tags: value.tags,
                visibility: value.visibility,
              }
            : value.type === "images"
              ? {
                  type: "images",
                  title: value.title,
                  mediaIds: [],
                  tags: value.tags,
                  visibility: value.visibility,
                }
              : {
                  type: "video",
                  title: value.title,
                  mediaId: null,
                  tags: value.tags,
                  visibility: value.visibility,
                },
        )

        if (value.type !== "text" && uploads.length === 0) {
          throw new Error(
            value.type === "images" ? "Choose at least one image." : "Choose a video.",
          )
        }
        const draft = await createPostDraft({ data: draftInput })

        if (value.type === "images") {
          const intents = await createImageUploadIntents({
            data: {
              postId: draft.id,
              files: uploads.map((item) => ({
                filename: item.file.name,
                mimeType: imageMimeSchema.parse(item.file.type),
                byteSize: item.file.size,
                altText: item.altText,
              })),
            },
          })
          const assetIds: string[] = []
          for (const [index, item] of uploads.entries()) {
            const intent = intents[index]
            if (!intent) throw new Error("The image upload could not be started.")
            assetIds.push(intent.assetId)
            form.setFieldValue("mediaIds", [...assetIds])
            dispatch({ type: "uploading", clientId: item.clientId, assetId: intent.assetId })
            const controller = new AbortController()
            uploadControllers.current.set(item.clientId, controller)
            try {
              // Uploads are ordered to preserve media order without D1 writer races.
              // eslint-disable-next-line no-await-in-loop
              await uploadImage(
                intent.uploadUrl,
                item.file,
                (progress) => dispatch({ type: "progress", clientId: item.clientId, progress }),
                controller.signal,
              )
              dispatch({ type: "ready", clientId: item.clientId })
            } catch (error) {
              dispatch({ type: "failed", clientId: item.clientId, error: readableError(error) })
              throw error
            } finally {
              uploadControllers.current.delete(item.clientId)
            }
          }
        }

        if (value.type === "video") {
          const item = uploads[0]
          if (!item) throw new Error("Choose a video.")
          const intent = await createVideoUploadIntent({
            data: {
              postId: draft.id,
              filename: item.file.name,
              mimeType: item.file.type,
              byteSize: item.file.size,
            },
          })
          form.setFieldValue("mediaId", intent.assetId)
          dispatch({ type: "uploading", clientId: item.clientId, assetId: intent.assetId })
          const controller = new AbortController()
          uploadControllers.current.set(item.clientId, controller)
          try {
            await uploadVideo(
              intent.uploadUrl,
              intent.uploadProtocol,
              item.file,
              (progress) => dispatch({ type: "progress", clientId: item.clientId, progress }),
              controller.signal,
            )
            uploadControllers.current.delete(item.clientId)
            dispatch({ type: "processing", clientId: item.clientId })
            await waitForVideo(queryClient, intent.assetId)
            dispatch({ type: "ready", clientId: item.clientId })
          } catch (error) {
            dispatch({ type: "failed", clientId: item.clientId, error: readableError(error) })
            throw error
          } finally {
            uploadControllers.current.delete(item.clientId)
          }
        }

        const published = await publishPost({ data: { id: draft.id, version: draft.version } })
        releaseUploadPreviews(uploads)
        dispatch({ type: "reset" })
        toast.success("Posted")
        await navigate({ to: "/post/$postId", params: { postId: published.id } })
      } catch (error) {
        setSubmitError(readableError(error))
      }
    },
  })

  uploadsRef.current = uploads
  useEffect(() => () => releaseUploadPreviews(uploadsRef.current), [])

  if (!authenticated) {
    return (
      <Alert>
        <TriangleAlert />
        <AlertTitle>Sign in to post</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-4">
          <p>You need an account before you can save a draft or upload anything.</p>
          <Button
            onClick={() =>
              void navigate({ to: "/auth/$authView", params: { authView: "sign-in" } })
            }
          >
            Sign in
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  function changeType(type: ComposerValues["type"]) {
    releaseUploadPreviews(uploads)
    dispatch({ type: "reset" })
    form.setFieldValue("type", type)
    form.setFieldValue("mediaIds", [])
    form.setFieldValue("mediaId", null)
  }

  function selectFiles(files: FileList | null, type: ComposerValues["type"]) {
    if (!files) return
    const selected = [...files]
    const accepted = selected.filter((file) =>
      type === "images"
        ? ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) &&
          file.size <= 15 * 1024 * 1024
        : file.type.startsWith("video/") && file.size <= 2 * 1024 * 1024 * 1024,
    )
    const remaining = type === "images" ? Math.max(0, 20 - uploads.length) : 1
    dispatch({
      type: "add",
      items: accepted
        .slice(0, remaining)
        .map((file) => createUploadItem(file, type === "images" ? "image" : "video")),
    })
    if (accepted.length !== selected.length) {
      toast.error(
        type === "images"
          ? "Images must be JPG, PNG, WebP, or AVIF files no larger than 15 MB."
          : "Choose a video file no larger than 2 GB. Stream checks the 10-minute limit after upload.",
      )
    } else if (accepted.length > remaining) {
      toast.error(
        type === "images" ? "A post can contain up to 20 images." : "A post can contain one video.",
      )
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return
    dispatch({ type: "reorder", activeId: String(event.active.id), overId: String(event.over.id) })
  }

  function cancelUpload(item: UploadItem) {
    uploadControllers.current.get(item.clientId)?.abort()
    if (item.assetId) {
      void abortMediaUpload({ data: { id: item.assetId } }).catch(() => undefined)
    }
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    dispatch({ type: "remove", clientId: item.clientId })
  }

  return (
    <form
      className="grid gap-10"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.AppForm>
        <form.Subscribe selector={(state) => state.isDirty}>
          {(isDirty) => <UnsavedChangesGuard enabled={isDirty} />}
        </form.Subscribe>
        <FieldSet>
          <FieldLegend>Post</FieldLegend>
          <FieldGroup>
            <form.AppField name="type">
              {(field) => (
                <field.ChoiceField
                  label="Post type"
                  description="Choose text, a set of pictures, or one video."
                  options={[
                    { label: "Text", value: "text" },
                    { label: "Images", value: "images" },
                    { label: "Video", value: "video" },
                  ]}
                />
              )}
            </form.AppField>
            <form.Subscribe selector={(state) => state.values.type}>
              {(type) => <TypeSync type={type} onChange={changeType} />}
            </form.Subscribe>
            <form.AppField name="title" validators={{ onBlur: titleSchema }}>
              {(field) => <field.TextField label="Title" maxLength={100} />}
            </form.AppField>
            <form.Subscribe selector={(state) => state.values.type}>
              {(type) =>
                type === "text" ? (
                  <form.AppField name="textContent" validators={{ onBlur: textSchema }}>
                    {(field) => (
                      <field.TextareaField
                        label="Text"
                        description="Plain text only. Links become clickable when the post is shown."
                        maxLength={1_000}
                        rows={9}
                      />
                    )}
                  </form.AppField>
                ) : (
                  <MediaPicker
                    type={type}
                    uploads={uploads}
                    sensors={sensors}
                    onFiles={selectFiles}
                    onRemove={(item) => cancelUpload(item)}
                    onAltText={(clientId, altText) =>
                      dispatch({ type: "alt-text", clientId, altText })
                    }
                    onDragEnd={handleDragEnd}
                  />
                )
              }
            </form.Subscribe>
          </FieldGroup>
        </FieldSet>

        <Separator />

        <FieldSet>
          <FieldLegend>Sharing</FieldLegend>
          <FieldGroup>
            <form.AppField name="tags" validators={{ onBlur: tagsSchema }}>
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
                  description="Unlisted means anyone with the link can view it. It is not private."
                  options={[
                    { label: "Public", value: "public" },
                    { label: "Unlisted", value: "unlisted" },
                  ]}
                />
              )}
            </form.AppField>
          </FieldGroup>
        </FieldSet>

        <form.Subscribe selector={(state) => state.values}>
          {(values) =>
            values.title.trim() || values.textContent.trim() || uploads.length > 0 ? (
              <>
                <Separator />
                <ComposerPreview values={values} uploads={uploads} />
              </>
            ) : null
          }
        </form.Subscribe>

        {submitError ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Couldn’t post this</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end border-t pt-6">
          <form.SubmitButton className="sm:min-w-36">Post it</form.SubmitButton>
        </div>
      </form.AppForm>
    </form>
  )
}

function ComposerPreview({ values, uploads }: { values: ComposerValues; uploads: UploadItem[] }) {
  return (
    <section className="grid gap-5" aria-labelledby="composer-preview-title">
      <div>
        <h2 id="composer-preview-title" className="font-heading text-xl font-bold">
          Preview
        </h2>
      </div>
      <article className="border-y bg-muted/15 py-6">
        <div className="typeset typeset-post">
          <h2>{values.title.trim() || "Untitled post"}</h2>
          {values.type === "text" ? (
            <p>{values.textContent.trim() || "Your text will appear here."}</p>
          ) : null}
        </div>
        {values.type === "images" && uploads.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {uploads.map((item) =>
              item.previewUrl ? (
                <img
                  key={item.clientId}
                  src={item.previewUrl}
                  alt={item.altText}
                  className="aspect-square w-full object-cover"
                />
              ) : null,
            )}
          </div>
        ) : null}
        {values.type === "video" && uploads[0] ? (
          <div className="mt-5 grid aspect-video place-items-center bg-foreground text-background">
            <p className="text-sm font-medium">Video selected · {uploads[0].file.name}</p>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {values.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              #{tag}
            </Badge>
          ))}
          <Badge className="ml-auto" variant="outline">
            {values.visibility === "public" ? "Public" : "Unlisted"}
          </Badge>
        </div>
      </article>
    </section>
  )
}

function TypeSync({
  type,
  onChange,
}: {
  type: ComposerValues["type"]
  onChange: (type: ComposerValues["type"]) => void
}) {
  const previousType = useRef(type)
  useEffect(() => {
    if (previousType.current === type) return
    previousType.current = type
    onChange(type)
  }, [onChange, type])
  return null
}

function MediaPicker({
  type,
  uploads,
  sensors,
  onFiles,
  onRemove,
  onAltText,
  onDragEnd,
}: {
  type: "images" | "video"
  uploads: UploadItem[]
  sensors: ReturnType<typeof useSensors>
  onFiles: (files: FileList | null, type: ComposerValues["type"]) => void
  onRemove: (item: UploadItem) => void
  onAltText: (clientId: string, altText: string) => void
  onDragEnd: (event: DragEndEvent) => void
}) {
  const accept = type === "images" ? "image/jpeg,image/png,image/webp,image/avif" : "video/*"
  const limit =
    type === "images"
      ? "JPG, PNG, WebP, or AVIF. Up to 20 files, 15 MB and 80 megapixels each."
      : "One Stream-supported video, up to 2 GB and 10 minutes. Large files upload in resumable chunks."
  const inputId = `post-media-${type}`

  return (
    <div className="grid gap-4">
      <label
        htmlFor={inputId}
        aria-label={`Choose ${type === "images" ? "images" : "a video"} to upload`}
        className="group grid min-h-40 cursor-pointer place-items-center border border-dashed bg-muted/20 p-6 text-center transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/40"
      >
        <input
          id={inputId}
          className="sr-only"
          type="file"
          accept={accept}
          multiple={type === "images"}
          disabled={type === "video" && uploads.length > 0}
          onChange={(event) => {
            onFiles(event.currentTarget.files, type)
            event.currentTarget.value = ""
          }}
        />
        <span className="flex max-w-sm flex-col items-center gap-2">
          <Upload className="text-muted-foreground" />
          <span className="font-medium">Choose {type === "images" ? "images" : "a video"}</span>
          <span className="text-sm text-muted-foreground">{limit}</span>
        </span>
      </label>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={uploads.map((item) => item.clientId)}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-2">
            {uploads.map((item) => (
              <SortableUpload
                key={item.clientId}
                item={item}
                onRemove={onRemove}
                onAltText={onAltText}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function SortableUpload({
  item,
  onRemove,
  onAltText,
}: {
  item: UploadItem
  onRemove: (item: UploadItem) => void
  onAltText: (clientId: string, altText: string) => void
}) {
  const sortable = useSortable({
    id: item.clientId,
    disabled: item.kind === "video" || item.status !== "queued",
  })
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  }

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border bg-background p-3"
    >
      {item.previewUrl ? (
        <img src={item.previewUrl} alt="" className="size-14 object-cover" />
      ) : (
        <div className="grid size-14 place-items-center bg-muted text-xs font-medium">VIDEO</div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab text-muted-foreground disabled:cursor-default disabled:opacity-35"
            aria-label={`Reorder ${item.file.name}`}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical />
          </button>
          <p className="truncate text-sm font-medium">{item.file.name}</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {(item.file.size / 1024 / 1024).toFixed(1)} MB · {item.status}
        </p>
        {item.kind === "image" ? (
          <label
            htmlFor={`alt-text-${item.clientId}`}
            className="mt-3 grid gap-1 text-xs font-medium"
          >
            Alt text
            <Input
              id={`alt-text-${item.clientId}`}
              value={item.altText}
              maxLength={300}
              placeholder="Describe this image…"
              autoComplete="off"
              disabled={item.status !== "queued"}
              onChange={(event) => onAltText(item.clientId, event.currentTarget.value)}
            />
          </label>
        ) : null}
        {item.status !== "queued" ? (
          <Progress value={item.progress} className="mt-2 gap-1">
            <ProgressLabel className="sr-only">Upload progress</ProgressLabel>
            <ProgressValue />
          </Progress>
        ) : null}
        {item.error ? <p className="mt-2 text-xs text-destructive">{item.error}</p> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${item.file.name}`}
        disabled={item.status === "ready"}
        onClick={() => onRemove(item)}
      >
        <Trash2 />
      </Button>
    </div>
  )
}
