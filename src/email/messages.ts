import type { EmailNotificationPreference } from "@/domain"

import type { EmailContent, EmailOtpPurpose, EmailSubscription } from "./email"

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

type AuthenticationMessageInput =
  | Readonly<{
      template: "email-verification" | "password-reset"
      email: string
      url: string
      expirationMinutes: number
    }>
  | Readonly<{
      template: "account-deletion"
      email: string
      url: string
      expirationHours: number
    }>
  | Readonly<{
      template: "email-change-approval"
      currentEmail: string
      newEmail: string
      url: string
      expirationMinutes: number
    }>
  | Readonly<{
      template: "email-otp"
      purpose: Exclude<EmailOtpPurpose, "two-factor">
      email: string
      code: string
      expirationMinutes: number
    }>
  | Readonly<{
      template: "two-factor-otp"
      purpose: "two-factor"
      email: string
      code: string
      expirationMinutes: number
    }>

const copy = {
  "email-verification": "Verify your PistonPost email",
  "password-reset": "Reset your PistonPost password",
  "account-deletion": "Confirm PistonPost account deletion",
  "two-factor-otp": "Your PistonPost security code",
  "email-change-approval": "Approve your PistonPost email change",
} as const

const emailOtpSubjects = {
  "sign-in": "Your PistonPost sign-in code",
  "email-verification": "Verify your PistonPost email",
  "forget-password": "Reset your PistonPost password",
  "change-email": "Confirm your PistonPost email change",
} as const

export function authenticationMessage(input: AuthenticationMessageInput): EmailContent {
  if (input.template === "email-otp") {
    return {
      ...input,
      subject: emailOtpSubjects[input.purpose],
    }
  }

  return {
    ...input,
    subject: copy[input.template],
  }
}

type SecurityNotificationInput = Readonly<{
  readonly template: "password-changed" | "email-changed" | "new-device"
  readonly email: string
  readonly secureAccountUrl: string
  readonly timestamp?: string
}>

const securityCopy = {
  "password-changed": "Your PistonPost password changed",
  "email-changed": "Your PistonPost email is changing",
  "new-device": "New PistonPost sign-in",
} as const

export function securityNotificationMessage(input: SecurityNotificationInput): EmailContent {
  switch (input.template) {
    case "password-changed":
      return {
        ...input,
        template: "password-changed",
        subject: securityCopy[input.template],
      }
    case "new-device":
      return {
        ...input,
        template: "new-device",
        subject: securityCopy[input.template],
      }
  }

  return {
    template: input.template,
    subject: securityCopy[input.template],
    preview: "Email change requested",
    heading: "Email change requested",
    message:
      "An email address change was requested for your account. If this was not you, secure your account now.",
    action: {
      label: "Review account security",
      url: input.secureAccountUrl,
    },
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
  }
}
