export const TURNSTILE_ACTIONS = {
  createPost: "create_post",
  createReport: "create_report",
} as const

export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS]

export const HUMAN_VERIFICATION_ERROR_MESSAGE = "Human verification failed. Try again."
