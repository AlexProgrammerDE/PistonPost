import type { CaptchaRenderProps } from "@better-auth-ui/react/plugins/captcha"
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile"
import { useTheme } from "next-themes"
import { useEffect, useRef, useState } from "react"

import { getTurnstileWidgetSize, type TurnstileWidgetSize } from "@/lib/turnstile-widget-size"

export function TurnstileWidget({
  siteKey,
  setToken,
  clearToken,
  setReset,
}: CaptchaRenderProps & { readonly siteKey: string }) {
  const container = useRef<HTMLDivElement>(null)
  const turnstile = useRef<TurnstileInstance>(null)
  const [size, setSize] = useState<TurnstileWidgetSize | null>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    setReset(() => turnstile.current?.reset())
    return () => setReset(null)
  }, [setReset])

  useEffect(() => {
    const element = container.current
    if (!element) return undefined

    const updateSize = () => setSize(getTurnstileWidgetSize(element.clientWidth))
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={container}
      role="group"
      aria-label="Human verification"
      className="flex min-h-16 w-full justify-center"
    >
      {size ? (
        <Turnstile
          ref={turnstile}
          siteKey={siteKey}
          onSuccess={setToken}
          onExpire={clearToken}
          onError={clearToken}
          onTimeout={clearToken}
          // A size or theme change renders a new widget, which drops any earlier token.
          onWidgetLoad={clearToken}
          options={{
            appearance: "always",
            refreshExpired: "manual",
            size,
            theme: resolvedTheme === "dark" ? "dark" : "light",
          }}
        />
      ) : null}
    </div>
  )
}
