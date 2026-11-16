import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Trash2, Upload } from "lucide-react"
import { useEffect, useRef, type CSSProperties } from "react"
import { toast } from "sonner"

import { AppImage } from "@/components/AppImage"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { FileUpload, FileUploadDropzone, FileUploadTrigger } from "@/components/ui/file-upload"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { MAX_IMAGES_PER_POST } from "@/domain"
import { ImagePreparationError, prepareImageForUpload } from "@/lib/uploads/image-preparation"
import { IMAGE_UPLOAD_ACCEPT, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/uploads/image-upload-policy"
import type { EditablePostImage } from "@/lib/uploads/post-edit-images"
import { cn } from "@/lib/utils"

function fileRejectionMessage(message: string) {
  return message === `Maximum ${MAX_IMAGES_PER_POST} files allowed`
    ? `A post can contain up to ${MAX_IMAGES_PER_POST} images.`
    : "Images must be JPG, PNG, GIF, WebP, or AVIF files no larger than 15 MB."
}

export function ImagePostEditor({
  images,
  disabled,
  preparing,
  onChange,
  onPreparing,
}: {
  images: EditablePostImage[]
  disabled: boolean
  preparing: boolean
  onChange: (images: EditablePostImage[]) => void
  onPreparing: (preparing: boolean) => void
}) {
  const previews = useRef(new Set<string>())
  const preparingRef = useRef(false)
  const mounted = useRef(true)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  useEffect(() => {
    mounted.current = true
    const urls = previews.current
    return () => {
      mounted.current = false
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [])

  async function addFiles(files: File[]) {
    if (disabled || preparingRef.current) return
    preparingRef.current = true
    onPreparing(true)
    const remaining = Math.max(0, MAX_IMAGES_PER_POST - images.length)
    if (files.length > remaining)
      toast.error(`A post can contain up to ${MAX_IMAGES_PER_POST} images.`)
    const additions: EditablePostImage[] = []
    for (const file of files.slice(0, remaining)) {
      try {
        // Keep preparation ordered to cap peak memory for large galleries.
        // eslint-disable-next-line no-await-in-loop
        const prepared = await prepareImageForUpload(file)
        if (!mounted.current) return
        const previewUrl = URL.createObjectURL(prepared.file)
        previews.current.add(previewUrl)
        additions.push({
          clientId: crypto.randomUUID(),
          id: null,
          file: prepared.file,
          filename: prepared.metadata.filename,
          altText: "",
          previewUrl,
        })
      } catch (error) {
        toast.error(`Couldn’t add ${file.name}`, {
          description:
            error instanceof ImagePreparationError
              ? error.message
              : "This image could not be cleaned. Try exporting it again.",
        })
      }
    }
    if (mounted.current) {
      onChange([...images, ...additions])
      onPreparing(false)
    }
    preparingRef.current = false
  }

  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend variant="label">
          Images ({images.length} / {MAX_IMAGES_PER_POST})
        </FieldLegend>
        <FieldDescription>
          Drag to reorder. Add images, remove them, or change their alt text before saving.
        </FieldDescription>
        <FileUpload
          value={images.flatMap((image) => (image.file ? [image.file] : []))}
          label="Choose images to add"
          accept={IMAGE_UPLOAD_ACCEPT}
          multiple
          maxFiles={MAX_IMAGES_PER_POST}
          maxSize={MAX_IMAGE_UPLOAD_BYTES}
          disabled={disabled || preparing}
          onAccept={(files) => void addFiles(files)}
          onFileReject={(_, message) =>
            toast.error(fileRejectionMessage(message), { id: "edit-images-file-rejection" })
          }
        >
          <FileUploadDropzone aria-label="Image dropzone">
            <p role="status">
              {preparing ? "Cleaning images…" : "Drop images here or paste from your clipboard."}
            </p>
            <FileUploadTrigger render={<Button type="button" variant="outline" size="sm" />}>
              <Upload aria-hidden="true" data-icon="inline-start" />
              Add images
            </FileUploadTrigger>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, GIF, WebP, or AVIF. Up to 15 MB and 80 megapixels each.
            </p>
          </FileUploadDropzone>
        </FileUpload>
      </FieldSet>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (disabled || preparing || !over || active.id === over.id) return
          const from = images.findIndex(({ clientId }) => clientId === active.id)
          const to = images.findIndex(({ clientId }) => clientId === over.id)
          if (from >= 0 && to >= 0) onChange(arrayMove(images, from, to))
        }}
      >
        <SortableContext
          items={images.map(({ clientId }) => clientId)}
          strategy={verticalListSortingStrategy}
        >
          <ItemGroup aria-label="Post images">
            {images.map((image) => (
              <ImageRow
                key={image.clientId}
                image={image}
                disabled={disabled || preparing}
                onAltText={(altText) =>
                  onChange(
                    images.map((item) =>
                      item.clientId === image.clientId ? { ...item, altText } : item,
                    ),
                  )
                }
                onRemove={() => {
                  if (image.file) {
                    URL.revokeObjectURL(image.previewUrl)
                    previews.current.delete(image.previewUrl)
                  }
                  onChange(images.filter(({ clientId }) => clientId !== image.clientId))
                }}
              />
            ))}
          </ItemGroup>
        </SortableContext>
      </DndContext>
      {images.length === 0 ? (
        <FieldDescription>
          Keep at least one image, or add a replacement before saving.
        </FieldDescription>
      ) : null}
    </FieldGroup>
  )
}

function ImageRow({
  image,
  disabled,
  onRemove,
  onAltText,
}: {
  image: EditablePostImage
  disabled: boolean
  onRemove: () => void
  onAltText: (altText: string) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useSortable({
      id: image.clientId,
      disabled,
    })
  const style: CSSProperties & { "--image-transform": string | undefined } = {
    "--image-transform": CSS.Transform.toString(transform),
  }
  return (
    <div
      role="listitem"
      ref={setNodeRef}
      style={style}
      className={cn(
        "transform-(--image-transform)",
        !isDragging && "transition-transform duration-200 motion-reduce:transition-none",
      )}
    >
      <Item variant="outline" className="items-start">
        <ItemMedia variant="image" className="size-16">
          <AppImage src={image.previewUrl} alt="" className="size-full object-cover" />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="min-w-0">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              ref={setActivatorNodeRef}
              aria-label={`Reorder ${image.filename}`}
              disabled={disabled}
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden="true" />
            </Button>
            <span className="truncate">{image.filename}</span>
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${image.filename}`}
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </ItemActions>
        <ItemFooter>
          <Field data-disabled={disabled || undefined}>
            <FieldLabel htmlFor={`edit-alt-${image.clientId}`}>
              Alt text <span className="sr-only">for {image.filename}</span>
            </FieldLabel>
            <Input
              id={`edit-alt-${image.clientId}`}
              value={image.altText}
              maxLength={300}
              disabled={disabled}
              aria-describedby={`edit-alt-help-${image.clientId}`}
              // Enter would save the whole post while someone is still describing images.
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault()
              }}
              onChange={(event) => onAltText(event.currentTarget.value)}
            />
            <FieldDescription id={`edit-alt-help-${image.clientId}`}>
              Describe what matters in the image, or leave empty for a decorative image.
            </FieldDescription>
          </Field>
        </ItemFooter>
      </Item>
    </div>
  )
}
