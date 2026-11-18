import { userFacingServerMessage } from "@/lib/server-function-error"

const profileSaveFallbackMessage =
  "Your profile could not be saved. Check the fields and try again."

export function profileSaveErrorMessage(error: unknown) {
  return userFacingServerMessage(error) ?? profileSaveFallbackMessage
}
