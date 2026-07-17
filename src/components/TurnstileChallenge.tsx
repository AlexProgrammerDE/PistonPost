"use client"

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile"
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react"

import {
  HUMAN_VERIFICATION_ERROR_MESSAGE,
  isTurnstileTestSiteKey,
  TURNSTILE_TEST_TOKEN,
  type TurnstileAction,
} from "@/lib/turnstile"

const WIDGET_READY_TIMEOUT_MS = 10_000
const CHALLENGE_TIMEOUT_MS = 60_000

export type TurnstileChallengeHandle = {
  readonly execute: () => Promise<string>
  readonly reset: () => void
}

type TurnstileChallengeProps = {
  readonly action: TurnstileAction
  readonly ref?: Ref<TurnstileChallengeHandle>
  readonly siteKey: string
}

function challengeError() {
  return new Error(HUMAN_VERIFICATION_ERROR_MESSAGE)
}

function waitForWidget(instance: { readonly current: TurnstileInstance | null }) {
  if (instance.current) return Promise.resolve(instance.current)

  return new Promise<TurnstileInstance>((resolve, reject) => {
    const interval = setInterval(() => {
      if (!instance.current) return
      clearInterval(interval)
      clearTimeout(timeout)
      resolve(instance.current)
    }, 100)
    const timeout = setTimeout(() => {
      clearInterval(interval)
      reject(challengeError())
    }, WIDGET_READY_TIMEOUT_MS)
  })
}

export function TurnstileChallenge({ action, ref, siteKey }: TurnstileChallengeProps) {
  const turnstile = useRef<TurnstileInstance>(null)
  const rejectPending = useRef<((error: Error) => void) | null>(null)
  const testSiteKey = isTurnstileTestSiteKey(siteKey)
  const options = useMemo(
    () => ({
      action,
      appearance: "interaction-only" as const,
      execution: "execute" as const,
      refreshExpired: "never" as const,
      refreshTimeout: "auto" as const,
      responseField: false,
      theme: "auto" as const,
    }),
    [action],
  )

  const failPendingChallenge = useCallback(() => {
    rejectPending.current?.(challengeError())
    rejectPending.current = null
  }, [])

  useEffect(
    () => () => {
      failPendingChallenge()
    },
    [failPendingChallenge],
  )

  useImperativeHandle(
    ref,
    () => ({
      execute: async () => {
        if (testSiteKey) return TURNSTILE_TEST_TOKEN
        if (rejectPending.current) throw challengeError()
        const instance = await waitForWidget(turnstile)
        const failed = new Promise<never>((_, reject) => {
          rejectPending.current = reject
        })

        try {
          instance.reset()
          instance.execute()
          return await Promise.race([
            instance.getResponsePromise(CHALLENGE_TIMEOUT_MS, 250),
            failed,
          ])
        } catch {
          instance.reset()
          throw challengeError()
        } finally {
          rejectPending.current = null
        }
      },
      reset: () => {
        failPendingChallenge()
        turnstile.current?.reset()
      },
    }),
    [failPendingChallenge, testSiteKey],
  )

  if (testSiteKey) return null

  return (
    <Turnstile
      ref={turnstile}
      siteKey={siteKey}
      aria-label="Human verification"
      options={options}
      onError={failPendingChallenge}
      onExpire={failPendingChallenge}
      onTimeout={failPendingChallenge}
      onUnsupported={failPendingChallenge}
    />
  )
}
