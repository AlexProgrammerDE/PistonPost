export const TURNSTILE_ACTIONS = {
  createPost: "create_post",
  createReport: "create_report",
} as const

export const TURNSTILE_TEST_SITE_KEYS = {
  invisible: "1x00000000000000000000BB",
  visible: "1x00000000000000000000AA",
} as const

export const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"

export function isTurnstileTestSiteKey(siteKey: string) {
  return (
    siteKey === TURNSTILE_TEST_SITE_KEYS.visible || siteKey === TURNSTILE_TEST_SITE_KEYS.invisible
  )
}

export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS]

export const HUMAN_VERIFICATION_ERROR_MESSAGE = "Human verification failed. Try again."
