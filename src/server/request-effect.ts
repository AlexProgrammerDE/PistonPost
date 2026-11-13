import { getRequest } from "@tanstack/react-start/server"
import type { Effect } from "effect"

import { runServerEffect } from "./server-function-failure"

/** TanStack owns the request; native programs inherit its cancellation signal. */
export function runRequestEffect<A, E>(program: Effect.Effect<A, E>) {
  return runServerEffect(program, { signal: getRequest().signal })
}
