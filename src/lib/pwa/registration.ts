let registrationPromise: Promise<ServiceWorkerRegistration> | undefined

export function registerAppWorker() {
  registrationPromise ??= import("./service-worker.ts?worker&url")
    .then(({ default: url }) =>
      navigator.serviceWorker.register(url, { scope: "/", type: "module", updateViaCache: "none" }),
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
