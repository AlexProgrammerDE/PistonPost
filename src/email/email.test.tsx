import { describe, expect, it } from "bun:test"

import { Effect, Either, Exit, Layer } from "effect"

import { renderEmail } from "./email"
import { decodeEmailDeliveryJob } from "./jobs"
import { authenticationMessage, productUpdateMessage } from "./messages"
import {
  createCloudflareEmailTransport,
  createCaptureEmailTransport,
  deliverEmail,
  deliverImmediateEmail,
  EmailDeliveryError,
  EmailRenderer,
  EmailTransport,
} from "./transport"
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe"

describe("transactional email", () => {
  it("renders branded HTML and a plain-text fallback", async () => {
    const rendered = await renderEmail(
      authenticationMessage({
        template: "magic-link",
        url: "https://post.pistonmaster.net/auth/verify?token=redacted",
        expiresIn: "in 10 minutes",
      }),
    )

    expect(rendered.subject).toBe("Your PistonPost sign-in link")
    expect(rendered.html).toContain("https://post.pistonmaster.net/auth/verify?token=redacted")
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

  it("bounds immediate authentication delivery retries", async () => {
    let attempts = 0
    const transportLayer = Layer.succeed(EmailTransport, {
      send: () =>
        Effect.suspend(() => {
          attempts += 1
          return attempts < 3
            ? Effect.fail(
                new EmailDeliveryError({
                  message: "Temporary failure",
                  code: "E_INTERNAL_SERVER_ERROR",
                  retryable: true,
                }),
              )
            : Effect.void
        }),
    })

    await Effect.runPromise(
      deliverImmediateEmail({
        content: authenticationMessage({
          template: "password-reset",
          url: "https://post.pistonmaster.net/reset",
          expiresIn: "in one hour",
        }),
        to: "recipient@example.com",
        from: "auth@example.com",
        idempotencyKey: "password-reset:test",
      }).pipe(Effect.provide(Layer.mergeAll(EmailRenderer.live, transportLayer))),
    )

    expect(attempts).toBe(3)
  })

  it("decodes ID-only durable notification jobs", () => {
    const result = decodeEmailDeliveryJob({
      version: 2,
      type: "email.comment",
      idempotencyKey: "email.comment:user-one:comment-one",
      recipientUserId: "user-one",
      commentId: "comment-one",
    })

    expect(Either.isRight(result)).toBeTrue()
    expect(JSON.stringify(result)).not.toContain("@example.com")
  })

  it("rejects legacy, recipient-bearing, and pre-rendered queue payloads", () => {
    const result = decodeEmailDeliveryJob({
      version: 1,
      type: "email.comment",
      idempotencyKey: "unsafe",
      to: "author@example.com",
      html: "<script>not allowed</script>",
    })

    expect(Either.isLeft(result)).toBeTrue()
  })

  it("renders a working product unsubscribe link", async () => {
    const secret = "test-only-unsubscribe-secret-at-least-32-characters"
    const token = await Effect.runPromise(
      signUnsubscribeToken("user-one", "product-email", secret, Date.now() + 60_000),
    )
    const claims = await Effect.runPromise(verifyUnsubscribeToken(token, secret))
    const rendered = await renderEmail(
      productUpdateMessage({
        subject: "A small PistonPost update",
        preview: "New posting controls are ready.",
        heading: "Posting got a little easier",
        message: "You can now keep a draft while media finishes processing.",
        unsubscribeUrl: `https://post.pistonmaster.net/email/unsubscribe?token=${token}`,
      }),
    )

    expect(claims.userId).toBe("user-one")
    expect(claims.preference).toBe("product-email")
    expect(rendered.text).toContain("email/unsubscribe?token=")
  })

  it("adds a List-Unsubscribe header to product delivery", async () => {
    const captured: Array<Parameters<ReturnType<typeof createCaptureEmailTransport>["send"]>[0]> =
      []
    const unsubscribeUrl = "https://post.pistonmaster.net/email/unsubscribe?token=signed"
    await Effect.runPromise(
      deliverEmail({
        content: productUpdateMessage({
          subject: "A small update",
          preview: "A useful preview",
          heading: "Something changed",
          message: "Here is what changed.",
          unsubscribeUrl,
        }),
        to: "recipient@example.com",
        from: "notifications@example.com",
        idempotencyKey: "product:test",
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            EmailRenderer.live,
            Layer.succeed(EmailTransport, createCaptureEmailTransport(captured)),
          ),
        ),
      ),
    )

    expect(captured[0]?.headers).toEqual({
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "List-ID": "PistonPost updates <product-updates.post.pistonmaster.net>",
    })
  })

  it("does not add unsubscribe headers to required authentication email", async () => {
    const captured: Array<Parameters<ReturnType<typeof createCaptureEmailTransport>["send"]>[0]> =
      []
    await Effect.runPromise(
      deliverEmail({
        content: authenticationMessage({
          template: "magic-link",
          url: "https://post.pistonmaster.net/auth/verify?token=redacted",
          expiresIn: "in 10 minutes",
        }),
        to: "recipient@example.com",
        from: "auth@example.com",
        idempotencyKey: "authentication:test",
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            EmailRenderer.live,
            Layer.succeed(EmailTransport, createCaptureEmailTransport(captured)),
          ),
        ),
      ),
    )

    expect(captured[0]?.headers).toBeUndefined()
  })

  it("treats provider-suppressed recipients as a terminal delivery result", async () => {
    const providerError = Object.assign(new Error("Recipient suppressed"), {
      code: "E_RECIPIENT_SUPPRESSED",
    })
    const transport = createCloudflareEmailTransport({
      send: () => Promise.reject(providerError),
    })
    const rendered = await renderEmail(
      authenticationMessage({ template: "email-otp", code: "123456", expiresIn: "in 5 minutes" }),
    )

    const result = await Effect.runPromise(
      Effect.either(
        transport.send({
          ...rendered,
          to: "recipient@example.com",
          from: "auth@example.com",
          idempotencyKey: "suppressed:test",
        }),
      ),
    )

    expect(Either.isLeft(result)).toBeTrue()
    if (Either.isLeft(result)) {
      expect(result.left).toMatchObject({
        code: "E_RECIPIENT_SUPPRESSED",
        retryable: false,
      })
    }
  })

  it("rejects expired and modified unsubscribe links", async () => {
    const secret = "test-only-unsubscribe-secret-at-least-32-characters"
    const expired = await Effect.runPromise(
      signUnsubscribeToken("user-one", "comment-email", secret, Date.now() - 1),
    )
    const current = await Effect.runPromise(signUnsubscribeToken("user-one", "reply-email", secret))

    const expiredResult = await Effect.runPromiseExit(verifyUnsubscribeToken(expired, secret))
    const modifiedResult = await Effect.runPromiseExit(
      verifyUnsubscribeToken(`${current}changed`, secret),
    )

    expect(Exit.isFailure(expiredResult)).toBeTrue()
    expect(Exit.isFailure(modifiedResult)).toBeTrue()
  })
})
