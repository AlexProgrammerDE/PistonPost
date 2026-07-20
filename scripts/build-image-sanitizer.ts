import { fileURLToPath } from "node:url"

const repositoryRoot = new URL("../", import.meta.url)
const generatedPackage = new URL("../wasm/image-sanitizer/pkg/", import.meta.url)
const checkedInPackage = new URL("../src/lib/uploads/image-sanitizer-wasm/", import.meta.url)
const generatedFiles = [
  "package.json",
  "pistonpost_image_sanitizer.d.ts",
  "pistonpost_image_sanitizer.js",
  "pistonpost_image_sanitizer_bg.wasm",
  "pistonpost_image_sanitizer_bg.wasm.d.ts",
] as const

const build = Bun.spawn(
  [
    process.execPath,
    "x",
    "wasm-pack",
    "build",
    "wasm/image-sanitizer",
    "--target",
    "web",
    "--out-dir",
    "pkg",
    "--release",
  ],
  {
    cwd: fileURLToPath(repositoryRoot),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
)

const exitCode = await build.exited
if (exitCode !== 0) process.exit(exitCode)

await Promise.all(
  generatedFiles.map(async (filename) => {
    const source = new URL(filename, generatedPackage)
    if (!(await Bun.file(source).exists())) {
      throw new Error(`wasm-pack did not generate ${filename}`)
    }
    await Bun.write(new URL(filename, checkedInPackage), Bun.file(source))
  }),
)
