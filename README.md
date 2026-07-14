# PistonPost

PistonPost is a modern rewrite of the original media-focused social publishing app. The repository is a Bun and Turborepo monorepo built around TanStack Start, React 19, shadcn/ui on Base UI, and Cloudflare.

The implementation roadmap is in [PLAN.md](./PLAN.md). Agents and contributors must read [AGENTS.md](./AGENTS.md) before changing the repository.

## Current state

The repository contains the initialized TanStack Start application and shared shadcn/ui package. Product, storage, authentication, migration, and Cloudflare work remains intentionally tracked in the execution plan.

## Development

```bash
bun install
bun run dev
```

The web application runs from apps/web. Add shadcn components from the repository root:

```bash
bunx --bun shadcn@latest add <component> -c apps/web
```

Run the current baseline checks with:

```bash
bun run lint
bun run typecheck
bun run build
```
