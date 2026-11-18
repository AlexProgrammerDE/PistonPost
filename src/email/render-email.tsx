import { render } from "@react-email/render"

import { AuthenticationEmail, type EmailContent, type RenderedEmail } from "./email"

export async function renderEmail(content: EmailContent): Promise<RenderedEmail> {
  const element = <AuthenticationEmail content={content} />
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject: content.subject, html, text }
}
