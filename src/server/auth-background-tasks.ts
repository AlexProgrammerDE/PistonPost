import { waitUntil } from "cloudflare:workers"

export const betterAuthBackgroundTasks = { handler: waitUntil }
