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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pistonpost/ui/components/select"
import { Switch } from "@pistonpost/ui/components/switch"
import { Textarea } from "@pistonpost/ui/components/textarea"
import { createFormHook, createFormHookContexts } from "@tanstack/react-form"
import type { ComponentProps } from "react"

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
      <Select value={field.state.value} onValueChange={(value) => field.handleChange(value ?? "")}>
        <SelectTrigger id={field.name} className="w-full" aria-invalid={invalid}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {invalid ? <FieldError errors={errorMessages(field.state.meta.errors)} /> : null}
    </Field>
  )
}

function TagsField({ label, description }: FieldChromeProps) {
  const field = useFieldContext<string[]>()
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Combobox
        multiple
        items={field.state.value}
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value)}
      >
        <ComboboxChips aria-invalid={invalid}>
          {field.state.value.map((tag) => (
            <ComboboxChip key={tag}>{tag}</ComboboxChip>
          ))}
          <ComboboxChipsInput
            id={field.name}
            placeholder={field.state.value.length === 0 ? "photography, workshop" : "Add tag"}
            onBlur={field.handleBlur}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== ",") return
              event.preventDefault()
              const input = event.currentTarget
              const tag = input.value.trim().replace(/^#/, "")
              if (!tag || field.state.value.includes(tag) || field.state.value.length >= 5) return
              field.handleChange([...field.state.value, tag])
              input.value = ""
            }}
          />
        </ComboboxChips>
      </Combobox>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {invalid ? <FieldError errors={errorMessages(field.state.meta.errors)} /> : null}
    </Field>
  )
}

function SwitchField({ label, description }: FieldChromeProps) {
  const field = useFieldContext<boolean>()
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </FieldContent>
      <Switch
        id={field.name}
        checked={field.state.value}
        onCheckedChange={(checked) => field.handleChange(checked)}
      />
    </Field>
  )
}

function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const form = useFormContext()

  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
      {([canSubmit, isSubmitting]) => (
        <Button type="submit" disabled={!canSubmit || isSubmitting} {...props}>
          {isSubmitting ? "Publishing…" : children}
        </Button>
      )}
    </form.Subscribe>
  )
}

export const { useAppForm, withFieldGroup, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextareaField, SelectField, TagsField, SwitchField },
  formComponents: { SubmitButton },
})
