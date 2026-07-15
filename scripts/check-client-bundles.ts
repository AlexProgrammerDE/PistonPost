import { stat } from "node:fs/promises"
import { resolve } from "node:path"

const clientDirectory = resolve("dist/client/assets")
const forbiddenMarkers = ["@/db", "cloudflare:workers", "migration_mappings"]
const maximumChunkBytes = 600 * 1024
const maximumTotalBytes = 2_500_000

const files: Array<{ path: string; bytes: number }> = []
for await (const path of new Bun.Glob("**/*.js").scan({ cwd: clientDirectory, absolute: true })) {
  const details = await stat(path)
  files.push({ path, bytes: details.size })
}

if (files.length === 0) throw new Error("No production client JavaScript bundles were found.")

const localSecrets = Bun.file(resolve(".dev.vars"))
const secretValues = (await localSecrets.exists())
  ? (await localSecrets.text())
      .split(/\r?\n/)
      .map((line) => line.slice(line.indexOf("=") + 1).trim())
      .filter((value) => value.length >= 8)
  : []

const oversized = files.filter((file) => file.bytes > maximumChunkBytes)
if (oversized.length > 0) {
  throw new Error(
    `Client chunks exceed 600 KiB: ${oversized.map((file) => `${file.path} (${file.bytes.toString()} bytes)`).join(", ")}`,
  )
}

const totalBytes = files.reduce((total, file) => total + file.bytes, 0)
if (totalBytes > maximumTotalBytes) {
  throw new Error(
    `Client JavaScript totals ${totalBytes.toString()} bytes, above the 2.5 MB budget.`,
  )
}

await Promise.all(
  files.map(async (file) => {
    const source = await Bun.file(file.path).text()
    const marker = forbiddenMarkers.find((candidate) => source.includes(candidate))
    if (marker) throw new Error(`Server-only marker ${marker} leaked into ${file.path}.`)
    if (secretValues.some((secret) => source.includes(secret))) {
      throw new Error(`A local secret value leaked into ${file.path}.`)
    }
  }),
)

process.stdout.write(
  `Client bundle boundary passed: ${files.length.toString()} chunks, ${totalBytes.toString()} bytes.\n`,
)
