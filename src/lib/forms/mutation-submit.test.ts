import { describe, expect, test } from "bun:test"

import { FormApi } from "@tanstack/react-form"
import { MutationObserver, QueryClient } from "@tanstack/react-query"

import { submitMutation } from "./mutation-submit"

function failingSave() {
  const errors: unknown[] = []
  const mutation = new MutationObserver(new QueryClient(), {
    mutationFn: (_value: { subject: string }) => Promise.reject(new Error("save failed")),
    onError: (error) => {
      errors.push(error)
    },
  })
  return { errors, mutation }
}

describe("submitMutation", () => {
  test("settles a form submit when the mutation fails and keeps the values", async () => {
    const { errors, mutation } = failingSave()
    const form = new FormApi({
      defaultValues: { subject: "Release notes" },
      onSubmit: ({ value }) => submitMutation((input) => mutation.mutate(input), value),
    })
    form.mount()

    await form.handleSubmit()

    expect(errors).toHaveLength(1)
    expect(form.state.values).toEqual({ subject: "Release notes" })
    expect(form.state.isSubmitting).toBe(false)
  })

  test("returns after a successful mutation", async () => {
    const saved: string[] = []
    const mutation = new MutationObserver(new QueryClient(), {
      mutationFn: (value: { subject: string }) => {
        saved.push(value.subject)
        return Promise.resolve(value)
      },
    })
    const form = new FormApi({
      defaultValues: { subject: "Release notes" },
      onSubmit: ({ value }) => submitMutation((input) => mutation.mutate(input), value),
    })
    form.mount()

    await form.handleSubmit()

    expect(saved).toEqual(["Release notes"])
    expect(form.state.isSubmitSuccessful).toBe(true)
  })

  test("a raw mutation submit rejects the handleSubmit promise", async () => {
    const { errors, mutation } = failingSave()
    const form = new FormApi({
      defaultValues: { subject: "Release notes" },
      onSubmit: async ({ value }) => mutation.mutate(value),
    })
    form.mount()

    const failure = await form.handleSubmit().then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect(errors).toHaveLength(1)
  })
})
