import { describe, expect, it } from "bun:test"

import { Effect, Either } from "effect"

import { renderEmail } from "./email"
import { decodeEmailJob, emailJobContent } from "./jobs"
import { authenticationMessage } from "./messages"
import { createCaptureEmailTransport } from "./transport"

describe("transactional email", () => {
  it("renders branded HTML and a plain-text fallback", async () => {
    const rendered = await renderEmail(
      authenticationMessage({
        template: "magic-link",
        url: "https://pistonpost.example/auth/verify?token=redacted",
        expiresIn: "in 10 minutes",
      }),
    )

    expect(rendered.subject).toBe("Your PistonPost sign-in link")
    expect(rendered.html).toContain("PISTONPOST / TRANSMISSION")
    expect(rendered.html).toContain("https://pistonpost.example/auth/verify?token=redacted")
    expect(rendered.text).toContain("SIGN IN TO PISTONPOST")
    expect(rendered.text).toContain("in 10 minutes")
  })

  it("captures local messages without external delivery", async () => {
    const captured: Array<Parameters<ReturnType<typeof createCaptureEmailTransport>["send"]>[0]> =
      []
    const transport = createCaptureEmailTransport(captured)
    const rendered = await renderEmail(
      authenticationMessage({ template: "email-otp", code: "123456", expiresIn: "in 5 minutes" }),
    )

    await Effect.runPromise(
      transport.send({
        ...rendered,
        to: "recipient@example.com",
        from: "auth@example.com",
        idempotencyKey: "verification:test",
      }),
    )

    expect(captured).toHaveLength(1)
    expect(captured[0]?.text).toContain("123456")
  })

  it("decodes safe queue data and renders it at delivery time", async () => {
    const result = decodeEmailJob({
      version: 1,
      type: "email.comment",
      idempotencyKey: "comment:one",
      to: "author@example.com",
      data: {
        actorName: "Avery",
        postTitle: "Lathe restoration",
        postUrl: "https://pistonpost.example/post/lathe",
      },
    })

    expect(Either.isRight(result)).toBeTrue()
    if (Either.isLeft(result)) return

    const rendered = await renderEmail(emailJobContent(result.right))
    expect(rendered.subject).toContain("Avery")
    expect(rendered.html).toContain("Lathe restoration")
    expect(rendered.text).toContain("Read the comment")
  })

  it("rejects pre-rendered queue payloads", () => {
    const result = decodeEmailJob({
      version: 1,
      type: "email.comment",
      idempotencyKey: "unsafe",
      to: "author@example.com",
      html: "<script>not allowed</script>",
    })

    expect(Either.isLeft(result)).toBeTrue()
  })
})
