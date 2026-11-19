import { describe, expect, it } from "bun:test"

import { Effect, Result, Exit, Layer } from "effect"

import { decodeEmailDeliveryJob } from "./jobs"
import {
  authenticationMessage,
  productUpdateMessage,
  securityNotificationMessage,
} from "./messages"
import { renderEmail } from "./render-email"
import {
  createCloudflareEmailTransport,
  createCaptureEmailTransport,
  deliverEmail,
  deliverImmediateEmail,
  EmailDeliveryError,
  EmailRenderer,
  EmailTransport,
} from "./transport"
import { signUnsubscribeToken, UnsubscribeTokenError, verifyUnsubscribeToken } from "./unsubscribe"

describe("transactional email", () => {
  it("renders branded HTML and a plain-text fallback", async () => {
    const rendered = await renderEmail(
      authenticationMessage({
        template: "password-reset",
        email: "recipient@example.com",
        url: "https://post.pistonmaster.net/auth/reset-password?token=redacted",
        expirationMinutes: 60,
      }),
    )

    expect(rendered.subject).toBe("Reset your PistonPost password")
    expect(rendered.html).toContain(
      "https://post.pistonmaster.net/auth/reset-password?token=redacted",
    )
    expect(rendered.text).toContain("RESET YOUR PASSWORD")
    expect(rendered.text).toContain("in 60 minutes")
  })

  it("captures local messages without external delivery", async () => {
    const captured: Parameters<ReturnType<typeof createCaptureEmailTransport>["send"]>[0][] = []
    const transport = createCaptureEmailTransport(captured)
    const rendered = await renderEmail(
      authenticationMessage({
        template: "email-otp",
        purpose: "email-verification",
        email: "recipient@example.com",
        code: "123456",
        expirationMinutes: 5,
      }),
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

  it("renders account approval and security mail with the Better Auth UI templates", async () => {
    const securityUrl = "https://post.pistonmaster.net/settings/security"
    const [accountDeletion, newDevice] = await Promise.all([
      renderEmail(
        authenticationMessage({
          template: "account-deletion",
          email: "delete@example.com",
          url: "https://post.pistonmaster.net/auth/redirect?redirectTo=redacted",
          expirationHours: 24,
        }),
      ),
      renderEmail(
        securityNotificationMessage({
          template: "new-device",
          email: "recipient@example.com",
          secureAccountUrl: securityUrl,
          timestamp: "2026-07-26T12:00:00.000Z",
        }),
      ),
    ])

    expect(accountDeletion.text).toContain("24 hours")
    expect(newDevice.html).toContain(securityUrl)
    expect(newDevice.text).not.toContain("IP Address")
  })

  it("sends immediate authentication email once without automatic retries", async () => {
    let attempts = 0
    const transportLayer = Layer.succeed(EmailTransport, {
      send: () =>
        Effect.suspend(() => {
          attempts += 1
          return attempts < 3
            ? Effect.fail(
                EmailDeliveryError.make({
                  message: "Temporary failure",
                  code: "E_INTERNAL_SERVER_ERROR",
                  retryable: true,
                }),
              )
            : Effect.void
        }),
    })

    const failure = await Effect.runPromise(
      deliverImmediateEmail({
        content: authenticationMessage({
          template: "password-reset",
          email: "recipient@example.com",
          url: "https://post.pistonmaster.net/reset",
          expirationMinutes: 60,
        }),
        to: "recipient@example.com",
        from: "auth@example.com",
        idempotencyKey: "password-reset:test",
      }).pipe(Effect.flip, Effect.provide([EmailRenderer.layer, transportLayer])),
    )

    expect(failure).toMatchObject({
      _tag: "EmailDeliveryError",
      code: "E_INTERNAL_SERVER_ERROR",
    })
    expect(attempts).toBe(1)
  })

  it("decodes ID-only durable notification jobs", () => {
    const result = decodeEmailDeliveryJob({
      version: 2,
      type: "email.comment",
      idempotencyKey: "email.comment:user-one:comment-one",
      recipientUserId: "user-one",
      commentId: "comment-one",
    })

    expect(Result.isSuccess(result)).toBeTrue()
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

    expect(Result.isFailure(result)).toBeTrue()
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

  it("matches the support footer to why the email was sent", async () => {
    const comment = await renderEmail({
      template: "comment-notification",
      subject: "Ann commented on Cats",
      preview: "A new comment was posted on Cats.",
      heading: "New comment on your post",
      message: "Ann left a comment on Cats.",
    })
    const emailChange = await renderEmail(
      securityNotificationMessage({
        template: "email-changed",
        email: "recipient@example.com",
        secureAccountUrl: "https://post.pistonmaster.net/settings/security",
      }),
    )

    for (const rendered of [comment, emailChange]) {
      expect(rendered.text).not.toContain("you can ignore it")
    }
    expect(comment.text).toContain("Questions? Contact PistonPost support")
    expect(emailChange.text).toContain("If you did not ask for this change, contact PistonPost")
  })

  it("supports dark mode in notification email", async () => {
    const rendered = await renderEmail({
      template: "reply-notification",
      subject: "Ann replied to your comment",
      preview: "A new reply was posted on Cats.",
      heading: "New reply to your comment",
      message: "Ann replied to your comment on Cats.",
    })

    expect(rendered.html).toContain('name="color-scheme"')
    expect(rendered.html).toContain("prefers-color-scheme: dark")
    expect(rendered.text).not.toContain("prefers-color-scheme")
  })

  it("adds a List-Unsubscribe header to product delivery", async () => {
    const captured: Parameters<ReturnType<typeof createCaptureEmailTransport>["send"]>[0][] = []
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
        Effect.provide([
          EmailRenderer.layer,
          Layer.succeed(EmailTransport, createCaptureEmailTransport(captured)),
        ]),
      ),
    )

    expect(captured[0]?.headers).toEqual({
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "List-ID": "PistonPost updates <product-updates.post.pistonmaster.net>",
    })
  })

  it("does not add unsubscribe headers to required authentication email", async () => {
    const captured: Parameters<ReturnType<typeof createCaptureEmailTransport>["send"]>[0][] = []
    await Effect.runPromise(
      deliverEmail({
        content: authenticationMessage({
          template: "password-reset",
          email: "recipient@example.com",
          url: "https://post.pistonmaster.net/auth/reset-password?token=redacted",
          expirationMinutes: 60,
        }),
        to: "recipient@example.com",
        from: "auth@example.com",
        idempotencyKey: "authentication:test",
      }).pipe(
        Effect.provide([
          EmailRenderer.layer,
          Layer.succeed(EmailTransport, createCaptureEmailTransport(captured)),
        ]),
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
      authenticationMessage({
        template: "email-otp",
        purpose: "email-verification",
        email: "recipient@example.com",
        code: "123456",
        expirationMinutes: 5,
      }),
    )

    const result = await Effect.runPromise(
      Effect.result(
        transport.send({
          ...rendered,
          to: "recipient@example.com",
          from: "auth@example.com",
          idempotencyKey: "suppressed:test",
        }),
      ),
    )

    expect(Result.isFailure(result)).toBeTrue()
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({
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

  it("maps malformed signed claims to a token error", async () => {
    const secret = "test-only-unsubscribe-secret-at-least-32-characters"
    const token = await Effect.runPromise(
      signUnsubscribeToken("user-one", "comment-email", secret, Number.NaN),
    )

    const result = await Effect.runPromise(Effect.result(verifyUnsubscribeToken(token, secret)))

    expect(Result.isFailure(result)).toBeTrue()
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(UnsubscribeTokenError)
    }
  })
})
