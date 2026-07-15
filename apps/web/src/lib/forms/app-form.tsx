"use client"

import { Button } from "@pistonpost/ui/components/button"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
} from "@pistonpost/ui/components/combobox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@pistonpost/ui/components/field"
import { Input } from "@pistonpost/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pistonpost/ui/components/select"
import { Spinner } from "@pistonpost/ui/components/spinner"
import { Switch } from "@pistonpost/ui/components/switch"
import { Textarea } from "@pistonpost/ui/components/textarea"
import { ToggleGroup, ToggleGroupItem } from "@pistonpost/ui/components/toggle-group"
import { createFormHook, createFormHookContexts } from "@tanstack/react-form"
import { useState, type ComponentProps } from "react"

import { addTagInputValues } from "./tag-input-state"

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

type SelectFieldProps = FieldChromeProps & {
  options: ReadonlyArray<{ label: string; value: string }>
}

function SelectField({ label, description, options }: SelectFieldProps) {
  const field = useFieldContext<string>()
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Select
        items={options}
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value ?? "")}
      >
        <SelectTrigger id={field.name} className="w-full" aria-invalid={invalid}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
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
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="w-full">
            {option.label}
          </ToggleGroupItem>
        ))}
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
    SelectField,
    ChoiceField,
    TagsField,
    SwitchField,
  },
  formComponents: { SubmitButton },
})
