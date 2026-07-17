import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import { render } from "@react-email/render"

export const emailTemplateKeys = [
  "email-verification",
  "magic-link",
  "password-reset",
  "password-changed",
  "email-changed",
  "account-deletion",
  "email-otp",
  "two-factor-otp",
  "new-device",
  "comment-notification",
  "reply-notification",
  "moderation-action",
  "product-update",
  "email-change-approval",
] as const

export type EmailTemplateKey = (typeof emailTemplateKeys)[number]

export type EmailContent = {
  readonly template: EmailTemplateKey
  readonly subject: string
  readonly preview: string
  readonly heading: string
  readonly message: string
  readonly action?: Readonly<{ label: string; url: string }>
  readonly code?: string
  readonly footnote?: string
  readonly unsubscribeUrl?: string
}

export type RenderedEmail = {
  readonly subject: string
  readonly html: string
  readonly text: string
}

export function PistonPostEmail({ content }: { readonly content: EmailContent }) {
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
          {content.code ? (
            <Section style={styles.codePlate}>
              <Text style={styles.code}>{content.code}</Text>
            </Section>
          ) : null}
          {content.action ? (
            <Button href={content.action.url} style={styles.button}>
              {content.action.label}
            </Button>
          ) : null}
          {content.footnote ? <Text style={styles.footnote}>{content.footnote}</Text> : null}
          {content.unsubscribeUrl ? (
            <Text style={styles.footnote}>
              You can{" "}
              <Link href={content.unsubscribeUrl} style={styles.link}>
                stop product update emails
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

export async function renderEmail(content: EmailContent): Promise<RenderedEmail> {
  const element = <PistonPostEmail content={content} />
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
  codePlate: {
    backgroundColor: "#2e2220",
    borderRadius: "8px",
    margin: "24px 0",
    padding: "16px",
    textAlign: "center" as const,
  },
  code: {
    color: "#ffe36e",
    fontFamily: "monospace",
    fontSize: "26px",
    fontWeight: "700",
    letterSpacing: "6px",
    margin: 0,
  },
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
