import { describe, expect, test } from "bun:test"

import { parseMigrationArgs } from "./args"

describe("migration arguments", () => {
  test("parses a resumable phase apply", () => {
    expect(
      parseMigrationArgs([
        "apply",
        "--source",
        "/backup",
        "--phase",
        "images",
        "--resume",
        "run-1",
        "--concurrency",
        "8",
      ]),
    ).toMatchObject({
      command: "apply",
      source: "/backup",
      phase: "images",
      resume: "run-1",
      concurrency: 8,
    })
  })

  test("requires explicit production confirmation", () => {
    expect(() =>
      parseMigrationArgs(["apply", "--source", "/backup", "--target", "production"]),
    ).toThrow("--confirm-production")
  })

  test("rejects invalid concurrency", () => {
    expect(() =>
      parseMigrationArgs(["dry-run", "--source", "/backup", "--concurrency", "0"]),
    ).toThrow("--concurrency")
  })

  test("accepts a quarantine-only recovery phase", () => {
    expect(
      parseMigrationArgs(["apply", "--source", "/backup", "--phase", "quarantine"]),
    ).toMatchObject({ phase: "quarantine" })
  })
})
