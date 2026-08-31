import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react"

import {
  readLocalDraft,
  removeLocalDraft,
  saveLocalDraft,
  type DraftValues,
} from "@/lib/pwa/local-draft"

type DraftForm = {
  state: { values: DraftValues }
  store: { subscribe: (callback: () => void) => { unsubscribe: () => void } }
}

type InitialDraft =
  | { status: "loading" }
  | { status: "ready"; draft: DraftValues | null }
  | { status: "unavailable" }
const pendingDraft: InitialDraft = { status: "loading" }
const subscribe = () => () => undefined

function initialDraftReader(userId: string | null) {
  let snapshot: InitialDraft | undefined
  return () => {
    if (!snapshot) {
      try {
        snapshot = { status: "ready", draft: userId ? readLocalDraft(userId) : null }
      } catch {
        snapshot = { status: "unavailable" }
      }
    }
    return snapshot
  }
}

export function useComposerDraft(userId: string | null, form: DraftForm) {
  // Read the browser's initial draft once after hydration. Autosaves must not become recovery prompts.
  const [readInitialDraft] = useState(() => initialDraftReader(userId))
  const initial = useSyncExternalStore(subscribe, readInitialDraft, () => pendingDraft)
  const [resolved, setResolved] = useState(false)
  const recovery = !resolved && initial.status === "ready" ? initial.draft : null
  const [unavailable, setUnavailable] = useState(false)
  const posted = useRef(false)
  const save = useEffectEvent(() => {
    if (!userId || initial.status === "loading" || recovery || posted.current) return
    try {
      saveLocalDraft(userId, form.state.values)
    } catch {
      setUnavailable(true)
    }
  })

  useEffect(() => {
    if (!userId) return undefined
    posted.current = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const subscription = form.store.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(save, 500)
    })
    const flush = () => {
      clearTimeout(timer)
      save()
    }
    const hide = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", hide)
    return () => {
      flush()
      subscription.unsubscribe()
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", hide)
    }
  }, [form, userId])

  function resume() {
    setResolved(true)
    if (userId) {
      try {
        saveLocalDraft(userId, form.state.values)
      } catch {
        setUnavailable(true)
      }
    }
  }

  function clearAfterPosting() {
    posted.current = true
    if (userId) {
      try {
        removeLocalDraft(userId)
      } catch {
        setUnavailable(true)
      }
    }
  }

  return {
    recovery,
    unavailable: unavailable || initial.status === "unavailable",
    resume,
    clearAfterPosting,
  }
}
