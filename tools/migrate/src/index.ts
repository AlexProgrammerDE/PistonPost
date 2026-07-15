import { Effect, Exit } from "effect"

import { parseMigrationArgs } from "./args"
import { migrationLog } from "./log"
import { migrationProgram } from "./pipeline"

const exit = await Effect.runPromiseExit(migrationProgram(parseMigrationArgs(Bun.argv.slice(2))))

if (Exit.isFailure(exit)) {
  migrationLog("error", "migration.failed", { cause: exit.cause })
  process.exitCode = 1
}
