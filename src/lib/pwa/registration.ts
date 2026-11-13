let registrationPromise: Promise<ServiceWorkerRegistration> | undefined

function createAppWorkerRegistration() {
  // The virtual development client does not register a worker in TanStack's SSR document.
  if (import.meta.env.DEV) {
    return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}dev-sw.js?dev-sw`, {
      type: "module",
      scope: import.meta.env.BASE_URL,
    })
  }
  return import("virtual:pwa-register").then(
    ({ registerSW }) =>
      new Promise<ServiceWorkerRegistration>((resolve, reject) => {
        registerSW({
          immediate: true,
          onRegisteredSW: (_, registration) => {
            if (registration) resolve(registration)
            else reject(new Error("Service worker registration is unavailable"))
          },
          onRegisterError: reject,
          onNeedReload: () => {
            // Only offline assets are cached. Updates need no reload that could interrupt a post.
          },
        })
      }),
  )
}

export function registerAppWorker() {
  registrationPromise ??= createAppWorkerRegistration().catch((error: unknown) => {
    registrationPromise = undefined
    throw error
  })
  return registrationPromise
}

export async function getActiveAppWorker() {
  await registerAppWorker()
  return navigator.serviceWorker.ready
}
