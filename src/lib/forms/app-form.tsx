"use client"

import { createFormHook, createFormHookContexts } from "@tanstack/react-form"
import { Plus, Tag, type LucideIcon } from "lucide-react"
import { lazy, Suspense, useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput } from "@/components/ui/combobox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { addTagInputValues } from "./tag-input-state"

const MarkdownEditor = lazy(() =>
  import("@/components/MarkdownEditor").then(({ MarkdownEditor: Editor }) => ({ default: Editor })),
)

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts()

type FieldChromeProps = {
  label: string
  description?: string
}

function errorMessages(errors: unknown[]) {
  return errors.flatMap((error) => {
    if (typeof error === "string") return [{ message: error }]
    if (error && typeof error === "object" && "message" in error) {
      const message = Reflect.get(error, "message")
      return typeof message === "string" ? [{ message }] : []
    }
    return []
  })
}

function TextField({
  label,
  description,
  ...props
}: FieldChromeProps & Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur">) {
  const field = useFieldContext<string>()
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.currentTarget.value)}
        aria-invalid={invalid}
        {...props}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {invalid ? <FieldError errors={errorMessages(field.state.meta.errors)} /> : null}
    </Field>
  )
}

function TextareaField({
  label,
  description,
  ...props
}: FieldChromeProps & Omit<ComponentProps<typeof Textarea>, "value" | "onChange" | "onBlur">) {
  const field = useFieldContext<string>()
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Textarea
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.currentTarget.value)}
        aria-invalid={invalid}
        {...props}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {invalid ? <FieldError errors={errorMessages(field.state.meta.errors)} /> : null}
    </Field>
  )
}

function MarkdownField({
  label,
  description,
  maxLength,
}: FieldChromeProps & { maxLength: number }) {
  const field = useFieldContext<string>()
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Suspense fallback={<Skeleton className="min-h-80 w-full" />}>
        <MarkdownEditor
          id={field.name}
          name={field.name}
          value={field.state.value}
          maxLength={maxLength}
          aria-invalid={invalid}
          onBlur={field.handleBlur}
          onValueChange={field.handleChange}
        />
      </Suspense>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {invalid ? <FieldError errors={errorMessages(field.state.meta.errors)} /> : null}
    </Field>
  )
}

type FieldOption = {
  icon?: LucideIcon
  label: string
  value: string
}

type SelectFieldProps = FieldChromeProps & {
  options: ReadonlyArray<FieldOption>
}

function SelectField({ label, description, options }: SelectFieldProps) {
  const field = useFieldContext<string>()
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
  const selectedOption = options.find((option) => option.value === field.state.value)
  const SelectedIcon = selectedOption?.icon

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Select
        items={options}
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value ?? "")}
      >
        <SelectTrigger id={field.name} className="w-full" aria-invalid={invalid}>
          <SelectValue>
            {selectedOption ? (
              <>
                {SelectedIcon ? <SelectedIcon aria-hidden="true" /> : null}
                {selectedOption.label}
              </>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => {
              const OptionIcon = option.icon
              return (
                <SelectItem key={option.value} value={option.value}>
                  {OptionIcon ? <OptionIcon aria-hidden="true" /> : null}
                  {option.label}
                </SelectItem>
              )
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {invalid ? <FieldError errors={errorMessages(field.state.meta.errors)} /> : null}
    </Field>
  )
}

function ChoiceField({ label, description, options }: SelectFieldProps) {
  const field = useFieldContext<string>()
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid

  return (
    <Field data-invalid={invalid}>
      <FieldLabel id={`${field.name}-label`}>{label}</FieldLabel>
      <ToggleGroup
        value={[field.state.value]}
        onValueChange={(values) => {
          const value = values[0]
          if (value) field.handleChange(value)
        }}
        variant="outline"
        className="grid w-full grid-cols-3"
        aria-labelledby={`${field.name}-label`}
      >
        {options.map((option) => {
          const OptionIcon = option.icon
          return (
            <ToggleGroupItem key={option.value} value={option.value} className="w-full">
              {OptionIcon ? <OptionIcon aria-hidden="true" data-icon="inline-start" /> : null}
              {option.label}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {invalid ? <FieldError errors={errorMessages(field.state.meta.errors)} /> : null}
    </Field>
  )
}

function TagsField({ label, description }: FieldChromeProps) {
  const field = useFieldContext<string[]>()
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
  const [draft, setDraft] = useState("")

  function commitTags(rawTags: string) {
    const next = addTagInputValues(field.state.value, rawTags)
    if (next.length !== field.state.value.length) field.handleChange(next)
    setDraft("")
  }

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Combobox
        multiple
        items={field.state.value}
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value)}
        inputValue={draft}
        onInputValueChange={(value) => {
          if (/[,\n]/u.test(value)) {
            commitTags(value)
            return
          }
          setDraft(value)
        }}
      >
        <ComboboxChips aria-invalid={invalid}>
          <Tag aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          {field.state.value.map((tag) => (
            <ComboboxChip key={tag}>{tag}</ComboboxChip>
          ))}
          <ComboboxChipsInput
            id={field.name}
            name={field.name}
            autoComplete="off"
            placeholder={field.state.value.length === 0 ? "Try art…" : "Add another tag…"}
            onBlur={() => {
              commitTags(draft)
              field.handleBlur()
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== ",") return
              event.preventDefault()
              commitTags(draft)
            }}
          />
          <Button
            type="button"
            size="xs"
            variant="secondary"
            disabled={!draft.trim() || field.state.value.length >= 5}
            onClick={() => commitTags(draft)}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Add
          </Button>
        </ComboboxChips>
      </Combobox>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {invalid ? <FieldError errors={errorMessages(field.state.meta.errors)} /> : null}
    </Field>
  )
}

function SwitchField({
  label,
  description,
  disabled = false,
}: FieldChromeProps & { disabled?: boolean }) {
  const field = useFieldContext<boolean>()
  return (
    <Field orientation="horizontal" data-disabled={disabled} className="max-w-2xl">
      <FieldContent>
        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </FieldContent>
      <Switch
        id={field.name}
        checked={field.state.value}
        onCheckedChange={(checked) => field.handleChange(checked)}
        disabled={disabled}
      />
    </Field>
  )
}

function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const form = useFormContext()

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" disabled={isSubmitting} {...props}>
          {isSubmitting ? (
            <>
              <Spinner data-icon="inline-start" />
              Working…
            </>
          ) : (
            children
          )}
        </Button>
      )}
    </form.Subscribe>
  )
}

export const { useAppForm, withFieldGroup, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    TextareaField,
    MarkdownField,
    SelectField,
    ChoiceField,
    TagsField,
    SwitchField,
  },
  formComponents: { SubmitButton },
})
