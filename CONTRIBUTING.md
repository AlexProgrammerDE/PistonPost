# Contribute to PistonPost

Contributions can fix behavior, improve documentation, or add focused tests.

## Before you start

Read [the support guide](SUPPORT.md) for questions and issue routing.
Search existing issues and pull requests. Discuss larger API, architecture, or dependency changes before implementation.

Work from `main` and target that branch in your pull request.
Keep each change focused. Avoid unrelated formatting and dependency updates.

## Prepare a checkout

Use Bun as declared in `package.json`. The application is one Cloudflare Worker. Read [PLAN.md](PLAN.md) and [AGENTS.md](AGENTS.md).

```bash
bun install --frozen-lockfile
bun run dev
```

Run the commands below from the repository root unless a command names another directory.
On Windows, use `gradlew.bat` in place of `./gradlew` for Gradle commands.

## Repository layout

- `src/`: application, auth, domain, database, and Worker code.
- `drizzle/`: generated database migrations.
- `wasm/image-sanitizer/`: image sanitizer source.
- `tests/`, `docs/`: test infrastructure and operation guides.

## Verify your change

```bash
bun run check
bun run generated:check
```

Use ignored development variables and synthetic accounts/media. Keep the checked-in generated sanitizer for normal installs. For Rust sanitizer changes, use `bun run wasm:build`. For critical journeys, run the matching Playwright tests. Keep auth responses and private content outside public caches. Change schema sources before generating named migrations. Never hand-edit generated migration SQL or metadata. Keep Lefthook enabled. Use `bun run ci` for application changes that need the complete CI gate.

Run the relevant checks before review. State the command and result in the pull request.
Install cargo-deny 0.20.2 before pushing changes to `Cargo.toml`, `Cargo.lock`, or `deny.toml`.
Run the check from the root with `cargo deny --locked --manifest-path wasm/image-sanitizer/Cargo.toml --config deny.toml check`.
If a check cannot run, explain the missing dependency or service. Do not claim it passed.
Keep generated artifacts consistent with their source and review their diff.

## Fuzzing

The image sanitizer has one coverage-guided fuzz target for each supported format in `wasm/image-sanitizer/fuzz/`.
Each target checks that the sanitizer does not crash, removes metadata, and keeps its output within the pixel limits.
It also checks that sanitizing the output again returns the same bytes. The upload route depends on this.

Fuzzing needs the `nightly-2026-11-01` toolchain and cargo-fuzz 0.13.2, so Lefthook does not run it.
The Fuzz workflow runs each target for one minute when the sanitizer changes and for ten minutes every week.

```bash
cd wasm/image-sanitizer
rustup toolchain install nightly-2026-11-01 --profile minimal
cargo install cargo-fuzz --version 0.13.2 --locked
cargo +nightly-2026-11-01 fuzz list
mkdir -p fuzz/corpus/sanitize_jpeg
cargo +nightly-2026-11-01 fuzz run sanitize_jpeg fuzz/corpus/sanitize_jpeg fuzz/seeds/sanitize_jpeg -- -max_total_time=300 -rss_limit_mb=2048 -timeout=60
```

Put the ignored `fuzz/corpus/<target>` directory first so that new inputs do not go into the committed seeds.
To reproduce or minimize a finding, pass the file from `fuzz/artifacts/<target>/`:

```bash
cargo +nightly-2026-11-01 fuzz run sanitize_jpeg fuzz/artifacts/sanitize_jpeg/<file>
cargo +nightly-2026-11-01 fuzz tmin sanitize_jpeg fuzz/artifacts/sanitize_jpeg/<file>
```

When you fix a finding, add the minimized input as a regression test in `src/lib.rs` and run `bun run wasm:build`.

## Style and documentation

Follow the existing code conventions and repository formatter. Keep commit hooks enabled.
Add focused tests for changed logic when practical. Avoid tests that only assert source strings.
Update documentation when commands, APIs, configuration, or expected behavior change.
Keep examples small and reproducible. Preserve exact identifiers, commands, and error messages.

## Open a pull request

Explain the problem and resulting behavior. Link related issues without a placeholder issue number.
Explain visibility, permission, upload, or migration effects. Include browser evidence for visible changes.
Include commands and results. State any runtime checks that remain necessary.
Respond to review with a correction or concrete evidence.

Use Conventional Commits: `type(scope): description`, for example `docs(contributing): explain local validation`.
Use a meaningful scope, or omit it. Keep the subject concise and imperative.
Add a body when the reason or compatibility impact is not obvious.

For vulnerabilities, follow [the security reporting instructions](SECURITY.md).
Remove credentials and private data from examples, logs, and screenshots.
