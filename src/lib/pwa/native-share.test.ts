import { afterAll, afterEach, describe, expect, it, mock, spyOn } from "bun:test"

import { prepareSharedImage, shareNatively } from "./native-share"

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
const share = mock(async (_data: ShareData) => undefined)
const canShare = mock((_data: ShareData) => true)
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { share, canShare } })
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { location: { origin: "https://pistonpost.test" } },
})
afterEach(() => {
  mock.restore()
  share.mockClear()
  canShare.mockClear()
})
afterAll(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator)
  else Reflect.deleteProperty(globalThis, "navigator")
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
  else Reflect.deleteProperty(globalThis, "window")
})

describe("native sharing", () => {
  it("treats cancellation quietly and preserves other platform errors", async () => {
    const data = { url: "https://pistonpost.test/post/example" }
    expect(await shareNatively(data)).toBe("shared")
    expect(share).toHaveBeenLastCalledWith(data)
    share.mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"))
    expect(await shareNatively(data)).toBe("cancelled")
    const denied = new DOMException("Not allowed", "NotAllowedError")
    share.mockRejectedValueOnce(denied)
    expect(shareNatively(data)).rejects.toBe(denied)
  })

  it("prepares only same-origin image media and leaves opening the share sheet to a later gesture", async () => {
    const request = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
    )
    const signal = new AbortController().signal
    expect(prepareSharedImage("https://elsewhere.test/image.png", signal)).rejects.toBeInstanceOf(
      Error,
    )
    expect(prepareSharedImage("/api/auth/get-session", signal)).rejects.toBeInstanceOf(Error)
    expect(request).not.toHaveBeenCalled()
    const file = await prepareSharedImage("/media/image/example", signal)
    expect(file.type).toBe("image/png")
    expect(file.size).toBe(3)
    expect(canShare).toHaveBeenCalledWith({ files: [file] })
    expect(share).not.toHaveBeenCalled()
  })

  it("rejects unsupported response types and bounds downloaded file bytes", async () => {
    const request = spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html>", { headers: { "content-type": "text/html" } }),
    )
    const signal = new AbortController().signal
    expect(prepareSharedImage("/media/image/example", signal)).rejects.toBeInstanceOf(Error)
    request.mockResolvedValueOnce(
      new Response(new Uint8Array(15 * 1024 * 1024 + 1), {
        headers: { "content-type": "image/png" },
      }),
    )
    expect(prepareSharedImage("/media/image/example", signal)).rejects.toBeInstanceOf(Error)
    expect(canShare).not.toHaveBeenCalled()
  })
})
