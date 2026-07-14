import { migrationCommands, migrationPhases, type MigrationOptions } from "./model"

const usage = `PistonPost legacy migration

Usage:
  bun run migrate analyze --source /path/to/backup
  bun run migrate dry-run --source /path/to/backup --report ./reports
  bun run migrate apply --source /path/to/backup --target local
  bun run migrate apply --source /path/to/backup --target production --resume <run-id> --confirm-production
  bun run migrate verify --source /path/to/backup --run <run-id>

Options:
  --source <path>             Mounted backup directory
  --target <target>           local, preview, or production
  --database <path>           Local rehearsal SQLite database
  --report <path>             Report directory or JSON path
  --resume, --run <run-id>    Resume or verify an existing run
  --phase <phase>             users, posts, comments, reactions, images, videos, verify
  --concurrency <n>           Media worker count, default 4
  --limit <n>                 Limit source records for a fixture run
  --user <legacy-id>          Restrict records to one legacy user
  --remote                    Use Cloudflare remote adapters
  --confirm-production        Required for production writes
  --help                      Show this message`

function valueAfter(args: string[], index: number, flag: string) {
  const value = args[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage}`)
  return value
}

export function parseMigrationArgs(args: string[]): MigrationOptions {
  if (args.includes("--help") || args.length === 0) throw new Error(usage)
  const commandValue = args[0]
  const command = migrationCommands.find((candidate) => candidate === commandValue)
  if (!command) {
    throw new Error(`Unknown migration command: ${commandValue ?? "none"}.\n\n${usage}`)
  }

  const options: MigrationOptions = {
    command,
    target: "local",
    report: "reports/migration",
    concurrency: 4,
    remote: false,
    confirmProduction: false,
  }
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index]
    switch (flag) {
      case "--source":
        options.source = valueAfter(args, index, flag)
        index += 1
        break
      case "--target": {
        const target = valueAfter(args, index, flag)
        if (target !== "local" && target !== "preview" && target !== "production") {
          throw new Error(`Invalid target: ${target}.`)
        }
        options.target = target
        index += 1
        break
      }
      case "--database":
        options.database = valueAfter(args, index, flag)
        index += 1
        break
      case "--report":
        options.report = valueAfter(args, index, flag)
        index += 1
        break
      case "--resume":
      case "--run":
        options.resume = valueAfter(args, index, flag)
        index += 1
        break
      case "--phase": {
        const phaseValue = valueAfter(args, index, flag)
        const phase = migrationPhases.find((candidate) => candidate === phaseValue)
        if (!phase) {
          throw new Error(`Invalid phase: ${phaseValue}.`)
        }
        options.phase = phase
        index += 1
        break
      }
      case "--concurrency":
        options.concurrency = Number(valueAfter(args, index, flag))
        index += 1
        break
      case "--limit":
        options.limit = Number(valueAfter(args, index, flag))
        index += 1
        break
      case "--user":
        options.user = valueAfter(args, index, flag)
        index += 1
        break
      case "--remote":
        options.remote = true
        break
      case "--confirm-production":
        options.confirmProduction = true
        break
      default:
        throw new Error(`Unknown option: ${flag}.\n\n${usage}`)
    }
  }
  if (
    !Number.isInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > 32
  ) {
    throw new Error("--concurrency must be an integer from 1 to 32.")
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer.")
  }
  if (options.command !== "verify" && !options.source) throw new Error("--source is required.")
  if (options.command === "verify" && !options.resume) throw new Error("verify requires --run.")
  if (
    options.target === "production" &&
    options.command === "apply" &&
    !options.confirmProduction
  ) {
    throw new Error("Production apply requires --confirm-production.")
  }
  if (options.remote && options.target === "local") {
    throw new Error("--remote requires --target preview or production.")
  }
  return options
}
