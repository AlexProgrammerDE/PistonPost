import type { CaptchaRenderProps } from "@better-auth-ui/react/plugins"
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile"
import { useTheme } from "next-themes"
import { useEffect, useRef } from "react"

export function TurnstileWidget({
  siteKey,
  setToken,
  clearToken,
  setReset,
}: CaptchaRenderProps & { readonly siteKey: string }) {
  const turnstile = useRef<TurnstileInstance>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    setReset(() => turnstile.current?.reset())
    return () => setReset(null)
  }, [setReset])

  return (
    <div role="group" aria-label="CAPTCHA verification" className="min-h-16 min-w-[300px]">
      <Turnstile
        ref={turnstile}
        siteKey={siteKey}
        onSuccess={setToken}
        onExpire={clearToken}
        onError={clearToken}
        options={{
          appearance: "always",
          refreshExpired: "manual",
          theme: resolvedTheme === "dark" ? "dark" : "light",
        }}
      />
    </div>
  )
}
