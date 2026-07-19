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
import {
  FileText,
  Globe2,
  GripVertical,
  Images,
  Link2,
  LogIn,
  Send,
  Share2,
  SquarePen,
  Trash2,
  TriangleAlert,
  Upload,
  Video,
  ZoomIn,
} from "lucide-react"
import { lazy, Suspense, useEffect, useReducer, useRef, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { LightboxLoadingFallback } from "@/components/LoadingStates"
import { TurnstileChallenge, type TurnstileChallengeHandle } from "@/components/TurnstileChallenge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard"
import { MAX_POST_MARKDOWN_LENGTH, postDraftInputSchema } from "@/domain"
import { useAppForm } from "@/lib/forms/app-form"
import { ownedMediaStatusQueryOptions } from "@/lib/queries/media"
import { HUMAN_VERIFICATION_ERROR_MESSAGE, TURNSTILE_ACTIONS } from "@/lib/turnstile"
import { normalizeImageUploadMetadata } from "@/lib/uploads/image-file-normalization"
import {
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_MIME_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
  isImageUploadMimeType,
} from "@/lib/uploads/image-upload-policy"
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
  .max(MAX_POST_MARKDOWN_LENGTH, "Use 10,000 characters or fewer.")
const tagsSchema = z
  .array(z.string())
  .min(1, "Add at least one tag.")
  .max(5, "Use at most five tags.")
const imageMimeSchema = z.enum(IMAGE_UPLOAD_MIME_TYPES)

const loadImageLightbox = () =>
  import("@/components/ImageLightbox").then((module) => ({
    default: module.ImageLightboxViewer,
  }))

const ComposerImageLightbox = lazy(loadImageLightbox)

function preloadImageLightbox() {
  void loadImageLightbox()
}

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
  "A new post can contain at most 20 images.",
  "The image upload could not be started.",
  "Large video uploads are not configured yet. Try a video under 200 MB.",
  "The video upload could not be started. Try again.",
  "Media is still processing.",
  "Video processing is taking longer than expected. The draft is still saved.",
  "The video could not be processed.",
  HUMAN_VERIFICATION_ERROR_MESSAGE,
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

export function PostComposer({
  authenticated,
  turnstileSiteKey,
}: {
  authenticated: boolean
  turnstileSiteKey: string
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [uploads, dispatch] = useReducer(mediaUploadReducer, [])
  const uploadsRef = useRef(uploads)
  const uploadControllers = useRef(new Map<string, AbortController>())
  const turnstile = useRef<TurnstileChallengeHandle>(null)
  const allowNavigationRef = useRef(false)
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
        const turnstileToken = await turnstile.current?.execute()
        if (!turnstileToken) throw new Error(HUMAN_VERIFICATION_ERROR_MESSAGE)
        const draft = await createPostDraft({ data: { draft: draftInput, turnstileToken } })

        if (value.type === "images") {
          const intents = await createImageUploadIntents({
            data: {
              postId: draft.id,
              files: uploads.map((item) => ({
                filename: item.filename,
                mimeType: imageMimeSchema.parse(item.mimeType),
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
                { filename: item.filename, mimeType: item.mimeType },
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
        allowNavigationRef.current = true
        form.reset()
        releaseUploadPreviews(uploads)
        dispatch({ type: "reset" })
        toast.success("Posted")
        await navigate({ to: "/post/$postId", params: { postId: published.id } })
      } catch (error) {
        setSubmitError(readableError(error))
      } finally {
        turnstile.current?.reset()
      }
    },
  })

  uploadsRef.current = uploads
  useEffect(() => () => releaseUploadPreviews(uploadsRef.current), [])

  if (!authenticated) {
    return (
      <Alert>
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Sign in to post</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-4">
          <p>You need an account before you can save a draft or upload anything.</p>
          <Button
            onClick={() =>
              void navigate({ to: "/auth/$authView", params: { authView: "sign-in" } })
            }
          >
            <LogIn aria-hidden="true" data-icon="inline-start" />
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

  async function selectFiles(files: FileList | null, type: ComposerValues["type"]) {
    if (!files) return
    const selected = [...files]
    const selections =
      type === "images"
        ? await Promise.all(
            selected.map(async (file) => ({
              file,
              metadata:
                file.size <= MAX_IMAGE_UPLOAD_BYTES
                  ? await normalizeImageUploadMetadata(file)
                  : { filename: file.name, mimeType: file.type },
            })),
          )
        : selected.map((file) => ({
            file,
            metadata: { filename: file.name, mimeType: file.type },
          }))
    const accepted = selections.filter(({ file, metadata }) =>
      type === "images"
        ? isImageUploadMimeType(metadata.mimeType) && file.size <= MAX_IMAGE_UPLOAD_BYTES
        : file.type.startsWith("video/") && file.size <= 2 * 1024 * 1024 * 1024,
    )
    const remaining = type === "images" ? Math.max(0, 20 - uploads.length) : 1
    dispatch({
      type: "add",
      items: accepted
        .slice(0, remaining)
        .map(({ file, metadata }) =>
          createUploadItem(file, type === "images" ? "image" : "video", metadata),
        ),
    })
    if (accepted.length !== selected.length) {
      toast.error(
        type === "images"
          ? "Images must be JPG, PNG, GIF, WebP, or AVIF files no larger than 15 MB."
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
          {(isDirty) => (
            <UnsavedChangesGuard allowNavigationRef={allowNavigationRef} enabled={isDirty} />
          )}
        </form.Subscribe>
        <FieldSet>
          <FieldLegend className="flex items-center gap-2">
            <SquarePen aria-hidden="true" className="size-4 text-muted-foreground" />
            Post
          </FieldLegend>
          <FieldGroup>
            <form.AppField name="type">
              {(field) => (
                <field.ChoiceField
                  label="Post type"
                  description="Choose text, a set of pictures, or one video."
                  options={[
                    { icon: FileText, label: "Text", value: "text" },
                    { icon: Images, label: "Images", value: "images" },
                    { icon: Video, label: "Video", value: "video" },
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
                      <field.MarkdownField
                        label="Text"
                        description="Use Markdown for headings, lists, links, tables, task lists, quotes, and code. Raw HTML is ignored."
                        maxLength={MAX_POST_MARKDOWN_LENGTH}
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
          <FieldLegend className="flex items-center gap-2">
            <Share2 aria-hidden="true" className="size-4 text-muted-foreground" />
            Sharing
          </FieldLegend>
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
                    { icon: Globe2, label: "Public", value: "public" },
                    { icon: Link2, label: "Unlisted", value: "unlisted" },
                  ]}
                />
              )}
            </form.AppField>
          </FieldGroup>
        </FieldSet>

        {submitError ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Couldn’t post this</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col items-end gap-3 border-t pt-6">
          <TurnstileChallenge
            ref={turnstile}
            action={TURNSTILE_ACTIONS.createPost}
            siteKey={turnstileSiteKey}
          />
          <form.SubmitButton className="sm:min-w-36">
            <Send aria-hidden="true" data-icon="inline-start" />
            Post it
          </form.SubmitButton>
        </div>
      </form.AppForm>
    </form>
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
  onFiles: (files: FileList | null, type: ComposerValues["type"]) => Promise<void>
  onRemove: (item: UploadItem) => void
  onAltText: (clientId: string, altText: string) => void
  onDragEnd: (event: DragEndEvent) => void
}) {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const accept = type === "images" ? IMAGE_UPLOAD_ACCEPT : "video/*"
  const limit =
    type === "images"
      ? "JPG, PNG, GIF, WebP, or AVIF. Up to 20 files, 15 MB and 80 megapixels each."
      : "One Stream-supported video, up to 2 GB and 10 minutes. Large files upload in resumable chunks."
  const inputId = `post-media-${type}`
  const imageUploads = uploads.filter(
    (item): item is UploadItem & { previewUrl: string } =>
      item.kind === "image" && item.previewUrl !== null,
  )
  const selectedImageIndex =
    selectedImageId === null
      ? -1
      : imageUploads.findIndex((item) => item.clientId === selectedImageId)
  const imageSlides = imageUploads.map((item) => ({
    src: item.previewUrl,
    alt: item.altText.trim() || item.filename,
  }))

  function changeLightboxImage(index: number) {
    const image = imageUploads[index]
    if (image) setSelectedImageId(image.clientId)
  }

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
            void onFiles(event.currentTarget.files, type)
            event.currentTarget.value = ""
          }}
        />
        <span className="flex max-w-sm flex-col items-center gap-2">
          <Upload aria-hidden="true" className="text-muted-foreground" />
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
                onView={setSelectedImageId}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {selectedImageIndex >= 0 ? (
        <Suspense fallback={<LightboxLoadingFallback />}>
          <ComposerImageLightbox
            slides={imageSlides}
            label="Selected image viewer"
            galleryLabel="Selected post images"
            index={selectedImageIndex}
            onClose={() => setSelectedImageId(null)}
            onIndexChange={changeLightboxImage}
          />
        </Suspense>
      ) : null}
    </div>
  )
}

function SortableUpload({
  item,
  onRemove,
  onAltText,
  onView,
}: {
  item: UploadItem
  onRemove: (item: UploadItem) => void
  onAltText: (clientId: string, altText: string) => void
  onView: (clientId: string) => void
}) {
  const dragDisabled = item.kind === "video" || item.status !== "queued"
  const sortable = useSortable({
    id: item.clientId,
    disabled: dragDisabled,
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
        <button
          type="button"
          className="relative size-14 shrink-0 cursor-zoom-in overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={`View ${item.filename} full size`}
          onPointerEnter={preloadImageLightbox}
          onFocus={preloadImageLightbox}
          onClick={() => onView(item.clientId)}
        >
          <img src={item.previewUrl} alt="" className="size-full object-cover" />
          <span className="absolute right-1 bottom-1 grid size-5 place-items-center bg-background/90 text-foreground">
            <ZoomIn aria-hidden="true" className="size-3.5" />
          </span>
        </button>
      ) : (
        <div className="grid size-14 place-items-center bg-muted text-xs font-medium">VIDEO</div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-ml-2 cursor-grab text-muted-foreground active:cursor-grabbing disabled:cursor-default"
            aria-label={`Reorder ${item.filename}`}
            disabled={dragDisabled}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical aria-hidden="true" />
          </Button>
          <p className="truncate text-sm font-medium">{item.filename}</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {(item.file.size / 1024 / 1024).toFixed(1)} MB · {item.status}
        </p>
        {item.kind === "image" ? (
          <Field className="mt-3 gap-2" data-disabled={item.status !== "queued" || undefined}>
            <FieldLabel htmlFor={`alt-text-${item.clientId}`}>Alt text</FieldLabel>
            <Input
              id={`alt-text-${item.clientId}`}
              value={item.altText}
              maxLength={300}
              placeholder="Describe this image…"
              autoComplete="off"
              disabled={item.status !== "queued"}
              onChange={(event) => onAltText(item.clientId, event.currentTarget.value)}
            />
            <FieldDescription>
              Optional. Describe what matters in the image, or leave this empty for a decorative
              image.
            </FieldDescription>
          </Field>
        ) : null}
        {item.status !== "queued" ? (
          <Progress value={item.progress} className="mt-2 gap-1">
            <ProgressLabel className="sr-only">Upload progress</ProgressLabel>
            <ProgressValue />
          </Progress>
        ) : null}
        {item.error ? (
          <p className="mt-2 overflow-hidden text-xs text-destructive">{item.error}</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${item.filename}`}
        disabled={item.status === "ready"}
        onClick={() => onRemove(item)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  )
}
