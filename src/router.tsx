import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"

import { RouteError } from "@/components/RouteError"
import { RouterQueryClient } from "@/lib/queries/router-query-client"
import { shouldRetryQuery } from "@/lib/server-function-error"
import { getActiveSharedViewTransition, resolveRouteTransitionTypes } from "@/lib/view-transitions"

import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const queryClient = new RouterQueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, retry: shouldRetryQuery },
      mutations: { retry: false },
    },
  })
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },

    defaultErrorComponent: RouteError,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 300,
    defaultPendingMinMs: 300,
    defaultViewTransition: {
      types: (locationChangeInfo) => {
        if (
          // oxlint-disable-next-line typescript/prefer-optional-chain -- `window?.` throws on the server, where `window` is not declared.
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          return false
        }

        return resolveRouteTransitionTypes(locationChangeInfo, getActiveSharedViewTransition())
      },
    },
  })

  setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: false })

  return router
}

declare module "@tanstack/react-router" {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
