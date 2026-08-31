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
import { useStore } from "@tanstack/react-form"
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
import { SharedContentIntake } from "@/components/SharedContentIntake"
import { TurnstileChallenge, type TurnstileChallengeHandle } from "@/components/TurnstileChallenge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  FileUploadTrigger,
  useFileUpload,
} from "@/components/ui/file-upload"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard"
import { MAX_IMAGES_PER_POST, MAX_POST_MARKDOWN_LENGTH, postDraftInputSchema } from "@/domain"
import { useComposerDraft } from "@/hooks/use-composer-draft"
import { useAppForm } from "@/lib/forms/app-form"
import { sharedText, type SharedContent } from "@/lib/pwa/share-intake"
import { ownedMediaStatusQueryOptions } from "@/lib/queries/media"
import { HUMAN_VERIFICATION_ERROR_MESSAGE, TURNSTILE_ACTIONS } from "@/lib/turnstile"
import { ImagePreparationError, prepareImageForUpload } from "@/lib/uploads/image-preparation"
import {
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_MIME_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
  createImageUploadBatches,
} from "@/lib/uploads/image-upload-policy"
import {
  createUploadItem,
  mediaUploadReducer,
  releaseUploadPreviews,
  type UploadItem,
} from "@/lib/uploads/media-upload-state"
import { UploadClientError, uploadImage, uploadVideo } from "@/lib/uploads/upload-client"
import {
  prepareVideoForUpload,
  VideoPreparationError,
} from "@/lib/uploads/video-thumbnail-selection"
import { MAX_VIDEO_UPLOAD_BYTES } from "@/lib/uploads/video-upload-policy"
import { cn } from "@/lib/utils"
import { DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT } from "@/lib/video-thumbnail"
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
  `A new post can contain at most ${MAX_IMAGES_PER_POST.toString()} images.`,
  "The image upload could not be started.",
  "This video is too large to upload right now. Try a video under 200 MB.",
  "The video upload could not be started. Try again.",
  "Media is still processing.",
  "Images are still being cleaned.",
  "The video is still being checked.",
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

function fileRejectionMessage(type: "images" | "video", message: string) {
  const maxFiles = type === "images" ? MAX_IMAGES_PER_POST : 1
  if (message === `Maximum ${maxFiles} files allowed`) {
    return type === "images"
      ? `A post can contain up to ${MAX_IMAGES_PER_POST.toString()} images.`
      : "A post can contain one video."
  }

  return type === "images"
    ? "Images must be JPG, PNG, GIF, WebP, or AVIF files no larger than 15 MB."
    : "Choose a video no larger than 2 GB and no longer than 10 minutes."
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
  userId,
  shareId,
  turnstileSiteKey,
}: {
  userId: string | null
  shareId?: string
  turnstileSiteKey: string
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [uploads, dispatch] = useReducer(mediaUploadReducer, [])
  const uploadsRef = useRef(uploads)
  const uploadControllers = useRef(new Map<string, AbortController>())
  const mediaPreparationGeneration = useRef(0)
  const turnstile = useRef<TurnstileChallengeHandle>(null)
  const allowNavigationRef = useRef(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [preparingImageCount, setPreparingImageCount] = useState(0)
  const [isInspectingVideo, setIsInspectingVideo] = useState(false)
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

        if (value.type === "images" && preparingImageCount > 0) {
          throw new Error("Images are still being cleaned.")
        }
        if (value.type === "video" && isInspectingVideo) {
          throw new Error("The video is still being checked.")
        }
        if (value.type !== "text" && uploads.length === 0) {
          throw new Error(
            value.type === "images" ? "Choose at least one image." : "Choose a video.",
          )
        }
        const turnstileToken = await turnstile.current?.execute()
        if (!turnstileToken) throw new Error(HUMAN_VERIFICATION_ERROR_MESSAGE)
        const draft = await createPostDraft({ data: { draft: draftInput, turnstileToken } })

        if (value.type === "images") {
          const assetIds: string[] = []
          for (const uploadBatch of createImageUploadBatches(uploads)) {
            // Bounded batches keep D1 requests small and issue upload slots close to their use.
            // eslint-disable-next-line no-await-in-loop
            const intents = await createImageUploadIntents({
              data: {
                postId: draft.id,
                files: uploadBatch.map((item) => ({
                  filename: item.filename,
                  mimeType: imageMimeSchema.parse(item.mimeType),
                  byteSize: item.file.size,
                  altText: item.altText,
                })),
              },
            })
            for (const [index, item] of uploadBatch.entries()) {
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
              thumbnailTimestampPct:
                item.thumbnailTimestampPct ?? DEFAULT_VIDEO_THUMBNAIL_TIMESTAMP_PCT,
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
        localDraft.clearAfterPosting()
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

  const localDraft = useComposerDraft(userId, form)
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting)

  useEffect(() => {
    uploadsRef.current = uploads
  }, [uploads])
  useEffect(() => () => releaseUploadPreviews(uploadsRef.current), [])

  if (!userId) {
    return (
      <Alert>
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Sign in to post</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-4">
          <p>You need an account before you can save a draft or upload anything.</p>
          {shareId && (
            <p>Your shared content stays on this device for up to one hour while you sign in.</p>
          )}
          <Button
            onClick={() =>
              void navigate({
                to: "/auth/$authView",
                params: { authView: "sign-in" },
                search: {
                  redirectTo: `/posts/new${shareId ? `?shareId=${encodeURIComponent(shareId)}` : ""}`,
                },
              })
            }
          >
            <LogIn aria-hidden="true" data-icon="inline-start" />
            Sign in
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  function clearMedia() {
    mediaPreparationGeneration.current += 1
    setIsInspectingVideo(false)
    releaseUploadPreviews(uploads)
    dispatch({ type: "reset" })
    form.setFieldValue("mediaIds", [])
    form.setFieldValue("mediaId", null)
  }

  async function importSharedContent(content: SharedContent) {
    if (isSubmitting || preparingImageCount > 0 || isInspectingVideo)
      throw new Error("Wait for the current operation to finish.")
    clearMedia()
    const type = content.files.length > 0 ? "images" : "text"
    form.reset(
      { ...defaultValues, type, title: content.title, textContent: sharedText(content) },
      { keepDefaultValues: true },
    )
    localDraft.resume()
    if (
      content.files.length > 0 &&
      (await selectFiles(content.files, "images", true)) !== content.files.length
    ) {
      throw new Error("Some shared images could not be prepared.")
    }
  }

  async function selectFiles(files: File[], type: ComposerValues["type"], replace = false) {
    const remaining =
      type === "images" ? Math.max(0, MAX_IMAGES_PER_POST - (replace ? 0 : uploads.length)) : 1
    if (files.length > remaining) {
      toast.error(
        type === "images"
          ? `A post can contain up to ${MAX_IMAGES_PER_POST.toString()} images.`
          : "A post can contain one video.",
      )
    }

    const selected = files.slice(0, remaining)
    if (type === "video") {
      const accepted = selected.filter(
        (file) => file.type.startsWith("video/") && file.size <= MAX_VIDEO_UPLOAD_BYTES,
      )
      if (accepted.length !== selected.length) {
        toast.error("Choose a video no larger than 2 GB and no longer than 10 minutes.")
      }
      const video = accepted[0]
      if (!video) return 0

      const preparationGeneration = ++mediaPreparationGeneration.current
      setIsInspectingVideo(true)
      try {
        const prepared = await prepareVideoForUpload(video)
        if (mediaPreparationGeneration.current === preparationGeneration) {
          dispatch({
            type: "add",
            items: [
              createUploadItem(video, "video", {
                thumbnailTimestampPct: prepared.thumbnailTimestampPct,
              }),
            ],
          })
        }
      } catch (error) {
        toast.error(`Couldn’t add ${video.name}`, {
          description:
            error instanceof VideoPreparationError
              ? error.message
              : "This video could not be read. Try exporting it again.",
        })
      } finally {
        if (mediaPreparationGeneration.current === preparationGeneration) {
          setIsInspectingVideo(false)
        }
      }
      return 0
    }

    setPreparingImageCount((count) => count + selected.length)
    const preparationGeneration = ++mediaPreparationGeneration.current
    const prepared = []
    for (const file of selected) {
      try {
        // Preparation stays ordered to cap peak browser memory for large image dumps.
        // eslint-disable-next-line no-await-in-loop
        prepared.push(await prepareImageForUpload(file))
      } catch (error) {
        toast.error(`Couldn’t prepare ${file.name}`, {
          description:
            error instanceof ImagePreparationError
              ? error.message
              : "This image could not be cleaned safely. Try exporting it again.",
        })
      } finally {
        setPreparingImageCount((count) => Math.max(0, count - 1))
      }
    }
    if (mediaPreparationGeneration.current === preparationGeneration) {
      dispatch({
        type: "add",
        items: prepared.map(({ file, metadata }) => createUploadItem(file, "image", metadata)),
      })
      return prepared.length
    }
    return 0
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
        {shareId && (
          <SharedContentIntake
            key={shareId}
            shareId={shareId}
            userId={userId}
            onImport={importSharedContent}
          />
        )}
        {localDraft.recovery && (
          <Alert>
            <AlertTitle>Restore your text draft?</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <p>
                A draft is saved on this device. Restoring it replaces the current form. Images and
                videos must be selected again.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={isSubmitting || preparingImageCount > 0 || isInspectingVideo}
                  onClick={() => {
                    clearMedia()
                    if (localDraft.recovery)
                      form.reset(
                        { ...defaultValues, ...localDraft.recovery },
                        { keepDefaultValues: true },
                      )
                    localDraft.resume()
                  }}
                >
                  Restore draft
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={localDraft.resume}
                >
                  Discard saved draft
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground">
          {localDraft.unavailable
            ? "This browser could not save a recovery draft. Keep this page open until you post."
            : "Text and post details are saved on this device for seven days. Files are not saved. Signing out clears the draft."}
        </p>
        <form.Subscribe selector={(state) => state.isDirty}>
          {(isDirty) => (
            <UnsavedChangesGuard
              allowNavigationRef={allowNavigationRef}
              enabled={isDirty || uploads.length > 0}
              description="Text and post details may be recovered from this device. Selected files and upload progress will be lost if you leave."
            />
          )}
        </form.Subscribe>
        <FieldSet>
          <FieldLegend className="flex items-center gap-2">
            <SquarePen aria-hidden="true" className="size-4 text-muted-foreground" />
            Post
          </FieldLegend>
          <FieldGroup>
            <form.AppField name="type" listeners={{ onChange: clearMedia }}>
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
                    preparingImageCount={preparingImageCount}
                    isInspectingVideo={isInspectingVideo}
                    sensors={sensors}
                    onFiles={async (files, kind) => {
                      await selectFiles(files, kind)
                    }}
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

        {submitError ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Couldn’t post this</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}

        <FieldSeparator />
        <Field orientation="horizontal" className="flex-wrap justify-end">
          <TurnstileChallenge
            ref={turnstile}
            action={TURNSTILE_ACTIONS.createPost}
            siteKey={turnstileSiteKey}
          />
          <form.SubmitButton className="sm:min-w-36">
            <Send aria-hidden="true" data-icon="inline-start" />
            Post it
          </form.SubmitButton>
        </Field>
      </form.AppForm>
    </form>
  )
}

function MediaDropzonePrompt({
  type,
  preparingImageCount,
  isInspectingVideo,
}: {
  readonly type: "images" | "video"
  readonly preparingImageCount: number
  readonly isInspectingVideo: boolean
}) {
  const dragOver = useFileUpload((state) => state.dragOver)
  const mediaLabel = type === "images" ? "images" : "a video"
  const draggedMediaLabel = type === "images" ? "these images" : "this video"
  const pendingCheckMessage =
    type === "images"
      ? "They’ll be checked before they’re added."
      : "It’ll be checked before it’s added."

  return (
    <>
      <Upload
        aria-hidden="true"
        className={cn(
          "text-muted-foreground transition-colors",
          dragOver ? "text-primary" : undefined,
        )}
      />
      <div className="flex max-w-sm flex-col items-center gap-1 text-center">
        <p role="status" className={cn("font-medium", dragOver ? "text-primary" : undefined)}>
          {isInspectingVideo
            ? "Checking video"
            : preparingImageCount > 0
              ? `Cleaning ${preparingImageCount} ${preparingImageCount === 1 ? "image" : "images"}`
              : dragOver
                ? `Release to add ${draggedMediaLabel}`
                : `Drop ${mediaLabel} here`}
        </p>
        <p className="text-sm text-muted-foreground">
          {isInspectingVideo
            ? "Checking its length and choosing a preview frame."
            : preparingImageCount > 0
              ? "Removing hidden data and trimming oversized photos before upload."
              : dragOver
                ? pendingCheckMessage
                : "You can also paste from your clipboard."}
        </p>
      </div>
    </>
  )
}

function MediaPicker({
  type,
  uploads,
  preparingImageCount,
  isInspectingVideo,
  sensors,
  onFiles,
  onRemove,
  onAltText,
  onDragEnd,
}: {
  type: "images" | "video"
  uploads: UploadItem[]
  preparingImageCount: number
  isInspectingVideo: boolean
  sensors: ReturnType<typeof useSensors>
  onFiles: (files: File[], type: ComposerValues["type"]) => Promise<void>
  onRemove: (item: UploadItem) => void
  onAltText: (clientId: string, altText: string) => void
  onDragEnd: (event: DragEndEvent) => void
}) {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const accept = type === "images" ? IMAGE_UPLOAD_ACCEPT : "video/*"
  const limit =
    type === "images"
      ? `JPG, PNG, GIF, WebP, or AVIF. Up to ${MAX_IMAGES_PER_POST.toString()} files, 15 MB and 80 megapixels each.`
      : "One video, up to 2 GB and 10 minutes."
  const inputLabel = `Choose ${type === "images" ? "images" : "a video"} to upload`
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
      <FileUpload
        value={uploads.map(({ file }) => file)}
        accept={accept}
        maxFiles={type === "images" ? MAX_IMAGES_PER_POST : 1}
        maxSize={type === "images" ? MAX_IMAGE_UPLOAD_BYTES : MAX_VIDEO_UPLOAD_BYTES}
        label={inputLabel}
        multiple={type === "images"}
        disabled={
          preparingImageCount > 0 || isInspectingVideo || (type === "video" && uploads.length > 0)
        }
        onAccept={(files) => void onFiles(files, type)}
        onFileReject={(_, message) =>
          toast.error(fileRejectionMessage(type, message), {
            id: `composer-${type}-file-rejection`,
          })
        }
      >
        <FileUploadDropzone
          aria-label={type === "images" ? "Image dropzone" : "Video dropzone"}
          className="min-h-40 data-dragging:border-primary data-dragging:bg-primary/5 data-dragging:ring-[3px] data-dragging:ring-primary/15"
        >
          <MediaDropzonePrompt
            type={type}
            preparingImageCount={preparingImageCount}
            isInspectingVideo={isInspectingVideo}
          />
          <FileUploadTrigger render={<Button type="button" variant="outline" size="sm" />}>
            <Upload aria-hidden="true" data-icon="inline-start" />
            {type === "images" ? "Browse images" : "Browse for a video"}
          </FileUploadTrigger>
          <p className="max-w-sm text-xs text-muted-foreground">{limit}</p>
        </FileUploadDropzone>

        <FileUploadList>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={uploads.map((item) => item.clientId)}
              strategy={verticalListSortingStrategy}
            >
              {uploads.map((item) => (
                <SortableUpload
                  key={item.clientId}
                  item={item}
                  onRemove={onRemove}
                  onAltText={onAltText}
                  onView={setSelectedImageId}
                />
              ))}
            </SortableContext>
          </DndContext>
        </FileUploadList>
      </FileUpload>
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
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.clientId,
    disabled: dragDisabled,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const altTextId = `alt-text-${item.clientId}`
  const altTextDescriptionId = `${altTextId}-description`

  return (
    <Item
      ref={setNodeRef}
      style={style}
      role="listitem"
      variant="outline"
      className="items-start rounded-none bg-background p-3"
    >
      {item.previewUrl ? (
        <ItemMedia variant="image" className="size-14 rounded-none">
          <button
            type="button"
            className="relative size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
        </ItemMedia>
      ) : (
        <ItemMedia variant="icon" className="size-14 bg-muted">
          <Video aria-hidden="true" />
        </ItemMedia>
      )}
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none w-full min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-ml-2 cursor-grab text-muted-foreground active:cursor-grabbing disabled:cursor-default"
            aria-label={`Reorder ${item.filename}`}
            disabled={dragDisabled}
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" />
          </Button>
          <span className="min-w-0 truncate">{item.filename}</span>
        </ItemTitle>
        <ItemDescription className="line-clamp-none text-xs">
          {(item.file.size / 1024 / 1024).toFixed(1)} MB · {item.status}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
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
      </ItemActions>
      {item.kind === "image" || item.status !== "queued" || item.error ? (
        <ItemFooter className="items-start">
          <div className="grid min-w-0 flex-1 gap-3">
            {item.kind === "image" ? (
              <Field className="gap-2" data-disabled={item.status !== "queued" || undefined}>
                <FieldLabel htmlFor={altTextId}>Alt text</FieldLabel>
                <InputGroup data-disabled={item.status !== "queued" || undefined}>
                  <InputGroupInput
                    id={altTextId}
                    value={item.altText}
                    maxLength={300}
                    placeholder="Describe this image…"
                    autoComplete="off"
                    disabled={item.status !== "queued"}
                    aria-describedby={altTextDescriptionId}
                    onChange={(event) => onAltText(item.clientId, event.currentTarget.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText className="text-xs tabular-nums">
                      {item.altText.length.toLocaleString()} / 300
                    </InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription id={altTextDescriptionId}>
                  Optional. Describe what matters in the image, or leave this empty for a decorative
                  image.
                </FieldDescription>
              </Field>
            ) : null}
            {item.status !== "queued" ? (
              <Progress value={item.progress} className="gap-1">
                <ProgressLabel className="sr-only">Upload progress</ProgressLabel>
                <ProgressValue />
              </Progress>
            ) : null}
            {item.error ? (
              <Alert variant="destructive" className="py-2">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Upload failed</AlertTitle>
                <AlertDescription className="overflow-hidden text-xs">
                  {item.error}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </ItemFooter>
      ) : null}
    </Item>
  )
}
