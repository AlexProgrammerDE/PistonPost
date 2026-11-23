import { render } from "@react-email/render"

import { AuthenticationEmail, type EmailContent, type RenderedEmail } from "./email"

/**
 * Collapses a subject to one line. Post titles and display names can contain line breaks, and a
 * line break in a subject header is invalid at best and header injection at worst.
 */
export function singleLineSubject(subject: string) {
  return subject.replaceAll(/[\s\p{Cc}]+/gu, " ").trim()
}

export async function renderEmail(content: EmailContent): Promise<RenderedEmail> {
  const element = <AuthenticationEmail content={content} />
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject: singleLineSubject(content.subject), html, text }
}
