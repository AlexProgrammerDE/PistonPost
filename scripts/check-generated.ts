import { $ } from "bun"

const before = await $`git status --short --untracked-files=no`.text()

await $`bun run cf:typegen`
await $`bun run build`

const after = await $`git status --short --untracked-files=no`.text()
if (after !== before) {
  console.error("Generated files are stale. Regenerate them and commit the result.")
  process.exit(1)
}
