let registrationPromise: Promise<ServiceWorkerRegistration> | undefined

export function registerAppWorker() {
  registrationPromise ??= import("virtual:pwa-register")
    .then(
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
    .catch((error: unknown) => {
      registrationPromise = undefined
      throw error
    })
  return registrationPromise
}

export async function getActiveAppWorker() {
  await registerAppWorker()
  return navigator.serviceWorker.ready
}
