import { describe, expect, test } from "bun:test"

import { renderToString } from "react-dom/server"

import { useAppForm } from "./app-form"

const visibilityDescription = "Unlisted means anyone with the link can view it. It is not private."
const options = [
  { label: "Public", value: "public" },
  { label: "Unlisted", value: "unlisted" },
]

function ChoiceForm() {
  const form = useAppForm({ defaultValues: { visibility: "public" } })
  return (
    <form.AppField name="visibility">
      {(field) => (
        <field.ChoiceField
          label="Visibility"
          description={visibilityDescription}
          options={options}
        />
      )}
    </form.AppField>
  )
}

function SelectForm() {
  const form = useAppForm({ defaultValues: { visibility: "public" } })
  return (
    <form.AppField name="visibility">
      {(field) => (
        <field.SelectField
          label="Visibility"
          description={visibilityDescription}
          options={options}
        />
      )}
    </form.AppField>
  )
}

function describedControl(html: string, tag: string) {
  const control = new RegExp(`<${tag}\\b[^>]*aria-describedby="([^"]+)"`, "u").exec(html)
  const descriptionId = control?.[1]
  if (!descriptionId) return undefined
  const description = new RegExp(`id="${descriptionId}"[^>]*>([^<]*)<`, "u").exec(html)
  return description?.[1]
}

describe("app form fields", () => {
  test("a choice field describes its options with the field description", () => {
    const html = renderToString(<ChoiceForm />)

    expect(html).toContain('role="radiogroup"')
    expect(describedControl(html, "div")).toBe(visibilityDescription)
  })

  test("a select field describes its trigger with the field description", () => {
    const html = renderToString(<SelectForm />)

    expect(describedControl(html, "button")).toBe(visibilityDescription)
  })
})
