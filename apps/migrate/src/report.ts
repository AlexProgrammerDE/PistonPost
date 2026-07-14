import { mkdir, writeFile } from "node:fs/promises"
import { dirname, extname, resolve } from "node:path"

import type { MigrationIssue, MigrationReport } from "./model"

function issueLine(issue: MigrationIssue) {
  const identity = [issue.collection, issue.legacyId].filter(Boolean).join("/")
  return `- ${issue.severity.toUpperCase()} ${issue.code}${identity ? ` (${identity})` : ""}: ${issue.message}`
}

function markdown(report: MigrationReport) {
  const counts = Object.entries(report.counters)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => `| ${name} | ${count} |`)
    .join("\n")
  const checks = Object.entries(report.checks)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `| ${name} | ${String(value)} |`)
    .join("\n")
  const issues = report.issues.length > 0 ? report.issues.map(issueLine).join("\n") : "No issues."
  return `# PistonPost migration report

- Run: \`${report.runId}\`
- Command: \`${report.command}\`
- Target: \`${report.target}\`
- Source fingerprint: \`${report.sourceFingerprint}\`
- Started: ${report.startedAt}
- Finished: ${report.finishedAt}
- Verdict: **${report.verdict.toUpperCase()}**

## Counters

| Counter | Value |
| --- | ---: |
${counts || "| none | 0 |"}

## Verification

| Check | Value |
| --- | --- |
${checks || "| not run | false |"}

## Issues

${issues}
`
}

export async function writeMigrationReport(report: MigrationReport, destination: string) {
  const requested = resolve(destination)
  const jsonPath =
    extname(requested) === ".json" ? requested : resolve(requested, `${report.runId}.json`)
  const markdownPath = jsonPath.replace(/\.json$/i, ".md")
  await mkdir(dirname(jsonPath), { recursive: true })
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }),
    writeFile(markdownPath, markdown(report), { mode: 0o600 }),
  ])
  return { jsonPath, markdownPath }
}
