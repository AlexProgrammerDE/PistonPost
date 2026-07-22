import type { EmailNotificationPreference } from "@/domain"

import type { EmailContent, EmailSubscription, EmailTemplateKey } from "./email"

const emailListIds = {
  "comment-email": "PistonPost comments <comments.post.pistonmaster.net>",
  "reply-email": "PistonPost replies <replies.post.pistonmaster.net>",
  "product-email": "PistonPost updates <product-updates.post.pistonmaster.net>",
} as const satisfies Record<EmailNotificationPreference, string>

export function emailSubscription(
  preference: EmailNotificationPreference,
  unsubscribeUrl: string,
): EmailSubscription {
  return { preference, unsubscribeUrl, listId: emailListIds[preference] }
}

type AuthenticationMessageInput = {
  readonly template: Extract<
    EmailTemplateKey,
    | "email-verification"
    | "magic-link"
    | "password-reset"
    | "account-deletion"
    | "email-otp"
    | "two-factor-otp"
    | "email-change-approval"
  >
  readonly url?: string
  readonly code?: string
  readonly expiresIn: string
}

const copy = {
  "email-verification": ["Verify your PistonPost email", "Verify your email", "Verify email"],
  "magic-link": ["Your PistonPost sign-in link", "Sign in to PistonPost", "Sign in"],
  "password-reset": ["Reset your PistonPost password", "Reset your password", "Reset password"],
  "account-deletion": [
    "Confirm PistonPost account deletion",
    "Confirm account deletion",
    "Confirm deletion",
  ],
  "email-otp": ["Your PistonPost verification code", "Verify your request", "Verify"],
  "two-factor-otp": ["Your PistonPost security code", "Complete sign-in", "Complete sign-in"],
  "email-change-approval": [
    "Approve your PistonPost email change",
    "Approve your email change",
    "Approve email change",
  ],
} as const

export function authenticationMessage(input: AuthenticationMessageInput): EmailContent {
  const [subject, heading, actionLabel] = copy[input.template]
  return {
    template: input.template,
    subject,
    preview: `${heading}. This request expires ${input.expiresIn}.`,
    heading,
    message:
      "Use the secure action below to continue. PistonPost will never ask you to send this link or code to another person.",
    action: input.url ? { label: actionLabel, url: input.url } : undefined,
    code: input.code,
    footnote: `This request expires ${input.expiresIn}.`,
  }
}

type SecurityNotificationInput = {
  readonly template: "password-changed" | "email-changed" | "new-device"
}

const securityCopy = {
  "password-changed": [
    "Your PistonPost password changed",
    "Password changed",
    "Your password was changed. If this was not you, start account recovery immediately.",
  ],
  "email-changed": [
    "Your PistonPost email is changing",
    "Email change requested",
    "An email address change was requested for your account. If this was not you, secure your account now.",
  ],
  "new-device": [
    "New PistonPost sign-in",
    "New device sign-in",
    "A new session signed in to your account. Review active sessions if you do not recognize it.",
  ],
} as const

export function securityNotificationMessage(input: SecurityNotificationInput): EmailContent {
  const [subject, heading, message] = securityCopy[input.template]
  return {
    template: input.template,
    subject,
    preview: heading,
    heading,
    message,
    footnote: "PistonPost security messages are enabled for every account.",
  }
}

export function productUpdateMessage(input: {
  readonly subject: string
  readonly preview: string
  readonly heading: string
  readonly message: string
  readonly actionLabel?: string | null
  readonly actionUrl?: string | null
  readonly unsubscribeUrl: string
  readonly postalAddress: string
}): EmailContent {
  return {
    template: "product-update",
    subject: input.subject,
    preview: input.preview,
    heading: input.heading,
    message: input.message,
    action:
      input.actionLabel && input.actionUrl
        ? { label: input.actionLabel, url: input.actionUrl }
        : undefined,
    footnote: "You received this because product update emails are enabled for your account.",
    subscription: emailSubscription("product-email", input.unsubscribeUrl),
    senderPostalAddress: input.postalAddress,
  }
}
