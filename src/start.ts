import { createCsrfMiddleware, createStart } from "@tanstack/react-start"

import { serverFunctionErrorMiddleware } from "@/server/server-function-middleware"

const serverFunctionCsrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
})

export const startInstance = createStart(() => ({
  requestMiddleware: [serverFunctionCsrfMiddleware],
  functionMiddleware: [serverFunctionErrorMiddleware],
}))
