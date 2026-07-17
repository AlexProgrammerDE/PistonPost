import { stat } from "node:fs/promises"
import { resolve } from "node:path"

const clientDirectory = resolve("dist/client/assets")
const forbiddenMarkers = ["@/db", "cloudflare:workers"]

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

const totalBytes = files.reduce((total, file) => total + file.bytes, 0)

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
