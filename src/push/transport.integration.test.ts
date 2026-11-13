import { it } from "bun:test"
import assert from "node:assert/strict"
import { createECDH, randomBytes } from "node:crypto"
import { once } from "node:events"
import { createServer, type IncomingHttpHeaders } from "node:http"
import { Agent } from "node:https"
import { connect } from "node:net"

import { generateVAPIDKeys, sendNotification, WebPushError } from "web-push"

import { classifyPushFailure } from "./transport"

it("delivers encrypted VAPID requests and classifies real expired-provider responses", async () => {
  let status = 201
  const captured: Array<{ headers: IncomingHttpHeaders; body: Buffer }> = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
    })
    request.on("end", () => {
      captured.push({ headers: request.headers, body: Buffer.concat(chunks) })
      response.writeHead(status)
      response.end("mock push response")
    })
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  assert(address && typeof address === "object")
  const agent = new Agent()
  // This test agent routes the synthetic provider request to the local mock transport.
  agent.createConnection = () => connect({ host: "127.0.0.1", port: address.port })
  const browserKey = createECDH("prime256v1")
  browserKey.generateKeys()
  const vapid = generateVAPIDKeys()
  const target = {
    endpoint: "https://push.invalid/dependency-validation",
    keys: {
      p256dh: browserKey.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  }
  const payload = JSON.stringify({ title: "Validation", body: "encrypted test payload" })
  const options = {
    agent,
    TTL: 24 * 60 * 60,
    timeout: 5_000,
    vapidDetails: {
      subject: "mailto:validation@example.invalid",
      publicKey: vapid.publicKey,
      privateKey: vapid.privateKey,
    },
  }
  try {
    assert.equal((await sendNotification(target, payload, options)).statusCode, 201)
    const assertExpired = async (statusCode: number) => {
      status = statusCode
      await assert.rejects(sendNotification(target, payload, options), (cause: unknown) => {
        assert(cause instanceof WebPushError)
        const failure = classifyPushFailure(cause)
        assert.equal(failure._tag, "PushSubscriptionExpired")
        assert("statusCode" in failure)
        assert.equal(failure.statusCode, statusCode)
        return true
      })
    }
    await assertExpired(404)
    await assertExpired(410)
    assert.equal(captured.length, 3)
    for (const request of captured) {
      assert.equal(request.headers["content-encoding"], "aes128gcm")
      assert.equal(request.headers.ttl, "86400")
      assert(request.body.length > 0)
      assert.equal(request.body.includes(payload), false)
      const token = request.headers.authorization?.match(/t=([^, ]+)/)?.[1]
      assert(token)
      const claimsPayload = token.split(".")[1]
      assert(claimsPayload)
      assert(request.headers.authorization?.includes(`k=${vapid.publicKey}`))
      const claims: unknown = JSON.parse(Buffer.from(claimsPayload, "base64url").toString())
      assert(claims && typeof claims === "object" && "aud" in claims && "sub" in claims)
      assert.equal(claims.aud, "https://push.invalid")
      assert.equal(claims.sub, options.vapidDetails.subject)
    }
  } finally {
    agent.destroy()
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
})
