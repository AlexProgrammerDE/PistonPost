import { render } from "@react-email/render"
import { Body, Button, Container, Head, Heading, Html, Link, Preview, Text } from "react-email"

import { ChangeEmailConfirmationEmail } from "@/components/auth/email/change-email-confirmation"
import { DeleteAccountVerificationEmail } from "@/components/auth/email/delete-account-verification"
import type { EmailColors } from "@/components/auth/email/email-styles"
import { EmailVerificationEmail } from "@/components/auth/email/email-verification"
import { NewDeviceEmail } from "@/components/auth/email/new-device"
import { OtpEmail } from "@/components/auth/email/otp-email"
import { PasswordChangedEmail } from "@/components/auth/email/password-changed"
import { ResetPasswordEmail } from "@/components/auth/email/reset-password"
import type { EmailNotificationPreference } from "@/domain"

export type EmailSubscription = Readonly<{
  preference: EmailNotificationPreference
  unsubscribeUrl: string
  listId: string
}>

type EmailContentBase = {
  readonly subject: string
  readonly subscription?: EmailSubscription
}

type LinkAuthenticationEmailContent =
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

export type EmailOtpPurpose =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email"
  | "two-factor"

type OtpAuthenticationEmailContent =
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

type SecurityAuthenticationEmailContent =
  | Readonly<{
      template: "password-changed"
      email: string
      secureAccountUrl: string
      timestamp?: string
    }>
  | Readonly<{
      template: "new-device"
      email: string
      secureAccountUrl: string
      timestamp?: string
    }>

type GenericEmailContent = Readonly<{
  template:
    | "email-changed"
    | "comment-notification"
    | "reply-notification"
    | "moderation-action"
    | "product-update"
  preview: string
  heading: string
  message: string
  action?: Readonly<{ label: string; url: string }>
  footnote?: string
  subscription?: EmailSubscription
}>

export type EmailContent = EmailContentBase &
  (
    | LinkAuthenticationEmailContent
    | OtpAuthenticationEmailContent
    | SecurityAuthenticationEmailContent
    | GenericEmailContent
  )

export type RenderedEmail = {
  readonly subject: string
  readonly html: string
  readonly text: string
}

const authenticationEmailColors = {
  light: {
    background: "#fff9ed",
    border: "#e5d4bb",
    card: "#ffffff",
    cardForeground: "#2e2220",
    foreground: "#2e2220",
    muted: "#fff3df",
    mutedForeground: "#806a62",
    primary: "#c82d47",
    primaryForeground: "#ffffff",
  },
  dark: {
    background: "#211a18",
    border: "#4d3b35",
    card: "#2e2220",
    cardForeground: "#fff9ed",
    foreground: "#fff9ed",
    muted: "#3a2b27",
    mutedForeground: "#d3bdb4",
    primary: "#ff6b79",
    primaryForeground: "#2e2220",
  },
} satisfies EmailColors

const authenticationTemplateProps = {
  appName: "PistonPost",
  colors: authenticationEmailColors,
  darkMode: true,
  poweredBy: false,
} as const

const otpLocalization = {
  "sign-in": {
    VERIFY_YOUR_EMAIL: "Sign in to PistonPost",
    WE_NEED_TO_VERIFY_YOUR_EMAIL_ADDRESS:
      "Enter this code in your open browser to sign in to {appName} as {email}.",
  },
  "email-verification": {
    VERIFY_YOUR_EMAIL: "Verify your email",
    WE_NEED_TO_VERIFY_YOUR_EMAIL_ADDRESS:
      "Enter this code in your open browser to verify {email} for your {appName} account.",
  },
  "forget-password": {
    VERIFY_YOUR_EMAIL: "Reset your password",
    WE_NEED_TO_VERIFY_YOUR_EMAIL_ADDRESS:
      "Enter this code in your open browser to reset the password for {email} on {appName}.",
  },
  "change-email": {
    VERIFY_YOUR_EMAIL: "Confirm your email change",
    WE_NEED_TO_VERIFY_YOUR_EMAIL_ADDRESS:
      "Enter this code in your open browser to confirm the email change for {email} on {appName}.",
  },
  "two-factor": {
    VERIFY_YOUR_EMAIL: "Complete sign-in",
    WE_NEED_TO_VERIFY_YOUR_EMAIL_ADDRESS:
      "Enter this code in your open browser to finish signing in to {appName} as {email}.",
  },
} as const

function subscriptionLabel(preference: EmailNotificationPreference) {
  switch (preference) {
    case "comment-email":
      return "comment emails"
    case "reply-email":
      return "reply emails"
    case "product-email":
      return "product update emails"
  }
  const exhaustivePreference: never = preference
  return exhaustivePreference
}

export function PistonPostEmail({ content }: { readonly content: GenericEmailContent }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{content.preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>
            piston<span style={styles.brandAccent}>post</span>
          </Text>
          <Heading style={styles.heading}>{content.heading}</Heading>
          <Text style={styles.message}>{content.message}</Text>
          {content.action ? (
            <Button href={content.action.url} style={styles.button}>
              {content.action.label}
            </Button>
          ) : null}
          {content.footnote ? <Text style={styles.footnote}>{content.footnote}</Text> : null}
          {content.subscription ? (
            <Text style={styles.footnote}>
              You can{" "}
              <Link href={content.subscription.unsubscribeUrl} style={styles.link}>
                stop {subscriptionLabel(content.subscription.preference)}
              </Link>{" "}
              at any time.
            </Text>
          ) : null}
          <Text style={styles.footer}>
            {content.template === "product-update"
              ? "Questions about this update? Contact "
              : "If you did not request this message, you can ignore it or contact "}
            <Link href="mailto:support@pistonmaster.net" style={styles.link}>
              PistonPost support
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

function AuthenticationEmail({ content }: { readonly content: EmailContent }) {
  switch (content.template) {
    case "email-verification":
      return (
        <EmailVerificationEmail
          {...authenticationTemplateProps}
          email={content.email}
          expirationMinutes={content.expirationMinutes}
          url={content.url}
        />
      )
    case "password-reset":
      return (
        <ResetPasswordEmail
          {...authenticationTemplateProps}
          email={content.email}
          expirationMinutes={content.expirationMinutes}
          url={content.url}
        />
      )
    case "account-deletion":
      return (
        <DeleteAccountVerificationEmail
          {...authenticationTemplateProps}
          email={content.email}
          expirationHours={content.expirationHours}
          url={content.url}
        />
      )
    case "email-change-approval":
      return (
        <ChangeEmailConfirmationEmail
          {...authenticationTemplateProps}
          currentEmail={content.currentEmail}
          expirationMinutes={content.expirationMinutes}
          newEmail={content.newEmail}
          url={content.url}
        />
      )
    case "email-otp":
    case "two-factor-otp":
      return (
        <OtpEmail
          {...authenticationTemplateProps}
          email={content.email}
          expirationMinutes={content.expirationMinutes}
          localization={otpLocalization[content.purpose]}
          verificationCode={content.code}
        />
      )
    case "password-changed":
      return (
        <PasswordChangedEmail
          {...authenticationTemplateProps}
          email={content.email}
          secureAccountURL={content.secureAccountUrl}
          supportEmail="support@pistonmaster.net"
          timestamp={content.timestamp}
        />
      )
    case "new-device":
      return (
        <NewDeviceEmail
          {...authenticationTemplateProps}
          deviceInfo={content.timestamp ? { timestamp: content.timestamp } : undefined}
          secureAccountLink={content.secureAccountUrl}
          supportEmail="support@pistonmaster.net"
          userEmail={content.email}
        />
      )
    case "email-changed":
    case "comment-notification":
    case "reply-notification":
    case "moderation-action":
    case "product-update":
      return <PistonPostEmail content={content} />
  }

  const exhaustiveContent: never = content
  return exhaustiveContent
}

export async function renderEmail(content: EmailContent): Promise<RenderedEmail> {
  const element = <AuthenticationEmail content={content} />
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject: content.subject, html, text }
}

const styles = {
  body: {
    backgroundColor: "#fff9ed",
    color: "#2e2220",
    fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
    margin: 0,
    padding: "32px 12px",
  },
  container: {
    backgroundColor: "#ffffff",
    border: "1px solid #e5d4bb",
    borderRadius: "10px",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "32px",
  },
  brand: {
    color: "#2e2220",
    fontFamily: 'Outfit, "Helvetica Neue", Helvetica, sans-serif',
    fontSize: "20px",
    fontWeight: "800",
    letterSpacing: "-0.9px",
    lineHeight: "28px",
    margin: 0,
  },
  brandAccent: { color: "#dc3850" },
  heading: { fontSize: "28px", lineHeight: "34px", margin: "20px 0 12px" },
  message: { color: "#65504a", fontSize: "16px", lineHeight: "25px" },
  button: {
    backgroundColor: "#dc3850",
    borderRadius: "7px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: "700",
    margin: "20px 0",
    padding: "12px 18px",
    textDecoration: "none",
  },
  footnote: { color: "#806a62", fontSize: "13px", lineHeight: "20px" },
  footer: {
    borderTop: "1px solid #eadfd0",
    color: "#806a62",
    fontSize: "12px",
    lineHeight: "18px",
    marginTop: "28px",
    paddingTop: "18px",
  },
  link: { color: "#c82d47" },
} as const
