import { Effect } from "effect"

import { bindingOperation } from "./operation"

/** Reads a plain or Secrets Store secret. A missing or blank value returns null. */
export const readOptionalSecret = Effect.fn("readOptionalSecret")(function* (
  secret: string | SecretsStoreSecret | undefined,
) {
  const value =
    typeof secret === "string"
      ? secret
      : yield* bindingOperation("readOptionalSecret.operation", () => secret?.get())
  return value?.trim() || null
})
