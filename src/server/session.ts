import { createServerFn } from "@tanstack/react-start"

import { findRequestSession } from "@/server/request-session"

export const getCurrentSession = createServerFn({ method: "GET" }).handler(({ context }) =>
  findRequestSession(context),
)
