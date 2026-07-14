import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { Effect } from "effect"

import type { MigrationOptions } from "./model"
import { migrationProgram } from "./pipeline"

const fixture = new URL("../fixtures/legacy-valid", import.meta.url).pathname
const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

async function options(phase?: MigrationOptions["phase"]) {
  const directory = await mkdtemp(resolve(tmpdir(), "pistonpost-migrate-"))
  directories.push(directory)
  return {
    command: "apply",
    source: fixture,
    target: "local",
    database: resolve(directory, "rehearsal.sqlite"),
    report: resolve(directory, "reports"),
    concurrency: 2,
    remote: false,
    confirmProduction: false,
    phase,
  } satisfies MigrationOptions
}

describe("migration pipeline", () => {
  test("reconciles the complete fixture", async () => {
    const report = await Effect.runPromise(migrationProgram(await options()))

    expect(report.verdict).toBe("go")
    expect(report.checks).toMatchObject({
      foreignKeyViolations: 0,
      users: 2,
      posts: 3,
      comments: 1,
      reactions: 3,
      media: 3,
      unlistedPosts: 1,
    })
  })

  test("resumes a staged run and does not duplicate completed records", async () => {
    const firstOptions = await options("users")
    const first = await Effect.runPromise(migrationProgram(firstOptions))
    const resumed = await Effect.runPromise(
      migrationProgram({ ...firstOptions, phase: undefined, resume: first.runId }),
    )
    const rerun = await Effect.runPromise(
      migrationProgram({ ...firstOptions, phase: undefined, resume: first.runId }),
    )

    expect(resumed.checks).toMatchObject({ users: 2, posts: 3, comments: 1, media: 3 })
    expect(rerun.checks).toMatchObject({ users: 2, posts: 3, comments: 1, reactions: 3, media: 3 })
    expect(rerun.results.every((result) => result.state === "already-present")).toBeTrue()
  })
})
