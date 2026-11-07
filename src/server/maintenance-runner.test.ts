import { describe, expect, test } from "bun:test"

import { Cause, Deferred, Effect, Exit, Option } from "effect"

import { MaintenanceError, runMaintenanceTasks } from "./maintenance-runner"
import { bindingOperation } from "./operation"

function bindingNotStarted() {
  throw new Error("Binding was not started")
}

describe("scheduled maintenance lifetime", () => {
  test("collects failures and defects after independent cleanup finishes", async () => {
    const started = Deferred.makeUnsafe<void>()
    const finish = Deferred.makeUnsafe<void>()
    let cleaned = false
    let settled = false
    const result = Effect.runPromiseExit(
      runMaintenanceTasks([
        { name: "failed", run: Effect.fail("provider-error") },
        { name: "defect", run: Effect.die(new Error("unexpected")) },
        {
          name: "cleanup",
          run: Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined)
            yield* Deferred.await(finish)
            cleaned = true
          }),
        },
      ]),
    ).then((exit) => {
      settled = true
      return exit
    })
    await Effect.runPromise(Deferred.await(started))
    expect(settled).toBe(false)
    await Effect.runPromise(Deferred.succeed(finish, undefined))
    const exit = await result
    expect(cleaned).toBe(true)
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) return
    const error = Option.getOrThrow(Cause.findErrorOption(exit.cause))
    expect(error).toBeInstanceOf(MaintenanceError)
    expect(error.failures.map(({ task }) => task)).toEqual(["failed", "defect"])
    expect(Cause.hasFails(error.failures[0]?.cause ?? Cause.empty)).toBe(true)
    expect(Cause.hasDies(error.failures[1]?.cause ?? Cause.empty)).toBe(true)
  })

  test("caller cancellation stops interruptible work and waits for an executing binding", async () => {
    const started = Deferred.makeUnsafe<void>()
    let finish: () => void = bindingNotStarted
    const controller = new AbortController()
    let readerStopped = false
    let settled = false
    const result = Effect.runPromiseExit(
      runMaintenanceTasks([
        {
          name: "read",
          run: Effect.never.pipe(
            Effect.ensuring(
              Effect.sync(() => {
                readerStopped = true
              }),
            ),
          ),
        },
        {
          name: "write",
          run: bindingOperation(
            "write",
            () =>
              new Promise<void>((resolve) => {
                finish = resolve
                Effect.runSync(Deferred.succeed(started, undefined))
              }),
          ),
        },
      ]),
      { signal: controller.signal },
    ).then((exit) => {
      settled = true
      return exit
    })
    await Effect.runPromise(Deferred.await(started))
    controller.abort()
    await Effect.runPromise(Effect.yieldNow)
    expect(readerStopped).toBe(true)
    expect(settled).toBe(false)
    finish()
    const exit = await result
    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
  })
})
