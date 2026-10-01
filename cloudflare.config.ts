import { bindings, defineConfig, triggers, exports } from "cf/config"
import { loadEnv } from "vite"

import { readProductionDeployInput } from "./scripts/production-config.ts"
import * as entrypoint from "./src/server.ts" with { type: "cf-worker" }
export default defineConfig((ctx) => {
  switch (ctx.mode) {
    case "preview": {
      return defineConfig({
        worker: {
          name: "pistonpost-staging",
          compatibilityDate: "2026-07-14",
          compatibilityFlags: ["nodejs_compat"],
          entrypoint,
          placement: {
            mode: "smart",
          },
          cache: {
            enabled: true,
            crossVersionCache: true,
          },
          observability: {
            enabled: true,
            logs: {
              enabled: true,
              headSamplingRate: 1,
              invocationLogs: true,
            },
            traces: {
              enabled: true,
              headSamplingRate: 1,
            },
          },
          assets: {
            htmlHandling: "drop-trailing-slash",
            runWorkerFirst: [
              "/",
              "/_serverFn/*",
              "/account/*",
              "/admin/*",
              "/api/*",
              "/auth/*",
              "/email/*",
              "/health",
              "/media/*",
              "/post/*",
              "/posts",
              "/posts/*",
              "/robots.txt",
              "/settings",
              "/settings/*",
              "/sitemap.xml",
              "/tag/*",
              "/user/*",
            ],
          },
          triggers: [
            triggers.scheduled({
              schedule: "*/15 * * * *",
            }),
            triggers.queue({
              deadLetterQueue: "pistonpost-staging-dead-letter",
              maxBatchSize: 10,
              maxBatchTimeout: 5,
              maxRetries: 5,
              name: "pistonpost-staging-jobs",
            }),
            triggers.queue({
              maxBatchSize: 10,
              maxBatchTimeout: 5,
              maxRetries: 0,
              name: "pistonpost-staging-dead-letter",
            }),
          ],
          env: {
            BETTER_AUTH_API_KEY: bindings.secret(),
            BETTER_AUTH_SECRET: bindings.secret(),
            EMAIL_UNSUBSCRIBE_SECRET: bindings.secret(),
            TURNSTILE_SECRET: bindings.secret(),
            STREAM_WEBHOOK_SECRET: bindings.secret(),
            STREAM_ACCOUNT_ID: bindings.secret(),
            STREAM_API_TOKEN: bindings.secret(),
            VAPID_PRIVATE_KEY: bindings.secret(),
            APP_ENV: bindings.text("preview"),
            PUBLIC_APP_URL: bindings.text("https://staging.post.pistonmaster.net"),
            TURNSTILE_SITE_KEY: bindings.text("replace-with-preview-site-key"),
            AUTH_EMAIL_FROM: bindings.text(
              "PistonPost Staging <auth@transactional.pistonmaster.net>",
            ),
            NOTIFICATIONS_EMAIL_FROM: bindings.text(
              "PistonPost Staging <notifications@transactional.pistonmaster.net>",
            ),
            MARKETING_EMAIL_FROM: bindings.text(
              "PistonPost Updates <updates@transactional.pistonmaster.net>",
            ),
            SUPPORT_EMAIL: bindings.text("support@pistonmaster.net"),
            VAPID_PUBLIC_KEY: bindings.text(""),
            VAPID_SUBJECT: bindings.text("mailto:support@pistonmaster.net"),
            ANALYTICS: bindings.analyticsEngineDataset({
              name: "pistonpost_staging_events",
            }),
            DB: bindings.d1({
              name: "pistonpost-staging",
            }),
            MEDIA: bindings.r2({
              name: "pistonpost-staging-media",
            }),
            EMAIL: bindings.sendEmail({
              allowedSenderAddresses: [
                "auth@transactional.pistonmaster.net",
                "notifications@transactional.pistonmaster.net",
                "updates@transactional.pistonmaster.net",
              ],
            }),
            JOBS: bindings.queue({
              name: "pistonpost-staging-jobs",
            }),
            IMAGES: bindings.images({
              dev: {
                remote: true,
              },
            }),
            STREAM: bindings.stream({
              dev: {
                remote: true,
              },
            }),
            ANON_RATE_LIMITER: bindings.rateLimit({
              namespace: "21001",
              simple: {
                limit: 300,
                period: 60,
              },
            }),
            AUTH_RATE_LIMITER: bindings.rateLimit({
              namespace: "21002",
              simple: {
                limit: 20,
                period: 60,
              },
            }),
            USER_RATE_LIMITER: bindings.rateLimit({
              namespace: "21003",
              simple: {
                limit: 120,
                period: 60,
              },
            }),
            COMMENT_RATE_LIMITER: bindings.rateLimit({
              namespace: "21004",
              simple: {
                limit: 20,
                period: 60,
              },
            }),
            REACTION_RATE_LIMITER: bindings.rateLimit({
              namespace: "21005",
              simple: {
                limit: 120,
                period: 60,
              },
            }),
            UPLOAD_RATE_LIMITER: bindings.rateLimit({
              namespace: "21006",
              simple: {
                limit: 30,
                period: 60,
              },
            }),
            IMAGE_UPLOAD_RATE_LIMITER: bindings.rateLimit({
              namespace: "21008",
              simple: {
                limit: 180,
                period: 60,
              },
            }),
            POST_VIEW_RATE_LIMITER: bindings.rateLimit({
              namespace: "21007",
              simple: {
                limit: 1,
                period: 60,
              },
            }),
            ASSETS: bindings.assets(),
            ACCOUNT_DELETION: bindings.workflow({
              name: "pistonpost-staging-account-deletion",
              worker: "pistonpost-staging",
              exportName: "AccountDeletionWorkflow",
            }),
          },
          exports: {
            AccountDeletionWorkflow: exports.workflow({
              name: "pistonpost-staging-account-deletion",
            }),
          },
        },
      })
    }
    case "prod": {
      const input = readProductionDeployInput({
        ...loadEnv("production", process.cwd(), ""),
        ...process.env,
      })
      return defineConfig({
        worker: {
          name: "pistonpost-production",
          workersDev: false,
          previewUrls: false,
          domains: [new URL(input.baseUrl).hostname],
          compatibilityDate: "2026-07-14",
          compatibilityFlags: ["nodejs_compat"],
          entrypoint,
          placement: {
            mode: "smart",
          },
          cache: {
            enabled: true,
            crossVersionCache: true,
          },
          observability: {
            enabled: true,
            logs: {
              enabled: true,
              headSamplingRate: 1,
              invocationLogs: true,
            },
            traces: {
              enabled: true,
              headSamplingRate: 0.05,
            },
          },
          assets: {
            htmlHandling: "drop-trailing-slash",
            runWorkerFirst: [
              "/",
              "/_serverFn/*",
              "/account/*",
              "/admin/*",
              "/api/*",
              "/auth/*",
              "/email/*",
              "/health",
              "/media/*",
              "/post/*",
              "/posts",
              "/posts/*",
              "/robots.txt",
              "/settings",
              "/settings/*",
              "/sitemap.xml",
              "/tag/*",
              "/user/*",
            ],
          },
          triggers: [
            triggers.scheduled({
              schedule: "*/15 * * * *",
            }),
            triggers.queue({
              deadLetterQueue: "pistonpost-production-dead-letter",
              maxBatchSize: 10,
              maxBatchTimeout: 5,
              maxRetries: 5,
              name: "pistonpost-production-jobs",
            }),
            triggers.queue({
              maxBatchSize: 10,
              maxBatchTimeout: 5,
              maxRetries: 0,
              name: "pistonpost-production-dead-letter",
            }),
          ],
          env: {
            BETTER_AUTH_API_KEY: bindings.secretsStoreSecret({
              storeId: input.secretsStoreId,
              secretName: "BETTER_AUTH_API_KEY",
            }),
            BETTER_AUTH_SECRET: bindings.secretsStoreSecret({
              storeId: input.secretsStoreId,
              secretName: "BETTER_AUTH_SECRET",
            }),
            EMAIL_UNSUBSCRIBE_SECRET: bindings.secretsStoreSecret({
              storeId: input.secretsStoreId,
              secretName: "EMAIL_UNSUBSCRIBE_SECRET",
            }),
            TURNSTILE_SECRET: bindings.secretsStoreSecret({
              storeId: input.secretsStoreId,
              secretName: "TURNSTILE_SECRET",
            }),
            STREAM_WEBHOOK_SECRET: bindings.secretsStoreSecret({
              storeId: input.secretsStoreId,
              secretName: "STREAM_WEBHOOK_SECRET",
            }),
            STREAM_ACCOUNT_ID: bindings.secretsStoreSecret({
              storeId: input.secretsStoreId,
              secretName: "STREAM_ACCOUNT_ID",
            }),
            STREAM_API_TOKEN: bindings.secretsStoreSecret({
              storeId: input.secretsStoreId,
              secretName: "STREAM_API_TOKEN",
            }),
            VAPID_PRIVATE_KEY: bindings.secretsStoreSecret({
              storeId: input.secretsStoreId,
              secretName: "VAPID_PRIVATE_KEY",
            }),
            APP_ENV: bindings.text("production"),
            PUBLIC_APP_URL: bindings.text(input.baseUrl),
            TURNSTILE_SITE_KEY: bindings.text(input.turnstileSiteKey),
            AUTH_EMAIL_FROM: bindings.text("PistonPost Auth <auth@transactional.pistonmaster.net>"),
            NOTIFICATIONS_EMAIL_FROM: bindings.text(
              "PistonPost <notifications@transactional.pistonmaster.net>",
            ),
            MARKETING_EMAIL_FROM: bindings.text(
              "PistonPost Updates <updates@transactional.pistonmaster.net>",
            ),
            SUPPORT_EMAIL: bindings.text("support@pistonmaster.net"),
            VAPID_PUBLIC_KEY: bindings.text(input.vapidPublicKey),
            VAPID_SUBJECT: bindings.text("mailto:support@pistonmaster.net"),
            ANALYTICS: bindings.analyticsEngineDataset({
              name: "pistonpost_production_events",
            }),
            DB: bindings.d1({
              name: "pistonpost-production-global",
              id: input.d1DatabaseId,
            }),
            MEDIA: bindings.r2({
              name: "pistonpost-production-media",
              jurisdiction: "eu",
            }),
            EMAIL: bindings.sendEmail({
              allowedSenderAddresses: [
                "auth@transactional.pistonmaster.net",
                "notifications@transactional.pistonmaster.net",
                "updates@transactional.pistonmaster.net",
              ],
            }),
            JOBS: bindings.queue({
              name: "pistonpost-production-jobs",
            }),
            IMAGES: bindings.images({
              dev: {
                remote: true,
              },
            }),
            STREAM: bindings.stream({
              dev: {
                remote: true,
              },
            }),
            ANON_RATE_LIMITER: bindings.rateLimit({
              namespace: "31001",
              simple: {
                limit: 300,
                period: 60,
              },
            }),
            AUTH_RATE_LIMITER: bindings.rateLimit({
              namespace: "31002",
              simple: {
                limit: 20,
                period: 60,
              },
            }),
            USER_RATE_LIMITER: bindings.rateLimit({
              namespace: "31003",
              simple: {
                limit: 120,
                period: 60,
              },
            }),
            COMMENT_RATE_LIMITER: bindings.rateLimit({
              namespace: "31004",
              simple: {
                limit: 20,
                period: 60,
              },
            }),
            REACTION_RATE_LIMITER: bindings.rateLimit({
              namespace: "31005",
              simple: {
                limit: 120,
                period: 60,
              },
            }),
            UPLOAD_RATE_LIMITER: bindings.rateLimit({
              namespace: "31006",
              simple: {
                limit: 30,
                period: 60,
              },
            }),
            IMAGE_UPLOAD_RATE_LIMITER: bindings.rateLimit({
              namespace: "31008",
              simple: {
                limit: 180,
                period: 60,
              },
            }),
            POST_VIEW_RATE_LIMITER: bindings.rateLimit({
              namespace: "31007",
              simple: {
                limit: 1,
                period: 60,
              },
            }),
            ASSETS: bindings.assets(),
            ACCOUNT_DELETION: bindings.workflow({
              name: "pistonpost-production-account-deletion",
              worker: "pistonpost-production",
              exportName: "AccountDeletionWorkflow",
            }),
          },
          exports: {
            AccountDeletionWorkflow: exports.workflow({
              name: "pistonpost-production-account-deletion",
            }),
          },
        },
      })
    }
    default: {
      return defineConfig({
        worker: {
          name: "pistonpost-local",
          compatibilityDate: "2026-07-14",
          compatibilityFlags: ["nodejs_compat"],
          entrypoint,
          placement: {
            mode: "smart",
          },
          cache: {
            enabled: true,
            crossVersionCache: true,
          },
          observability: {
            enabled: true,
            logs: {
              enabled: true,
              headSamplingRate: 1,
              invocationLogs: true,
            },
            traces: {
              enabled: true,
              headSamplingRate: 1,
            },
          },
          assets: {
            htmlHandling: "drop-trailing-slash",
            runWorkerFirst: [
              "/",
              "/_serverFn/*",
              "/account/*",
              "/admin/*",
              "/api/*",
              "/auth/*",
              "/email/*",
              "/health",
              "/media/*",
              "/post/*",
              "/posts",
              "/posts/*",
              "/robots.txt",
              "/settings",
              "/settings/*",
              "/sitemap.xml",
              "/tag/*",
              "/user/*",
            ],
          },
          triggers: [
            triggers.scheduled({
              schedule: "*/15 * * * *",
            }),
            triggers.queue({
              deadLetterQueue: "pistonpost-local-dead-letter",
              maxBatchSize: 10,
              maxBatchTimeout: 5,
              maxRetries: 5,
              name: "pistonpost-local-jobs",
            }),
            triggers.queue({
              maxBatchSize: 10,
              maxBatchTimeout: 5,
              maxRetries: 0,
              name: "pistonpost-local-dead-letter",
            }),
          ],
          env: {
            BETTER_AUTH_API_KEY: bindings.secret(),
            BETTER_AUTH_SECRET: bindings.secret(),
            EMAIL_UNSUBSCRIBE_SECRET: bindings.secret(),
            TURNSTILE_SECRET: bindings.secret(),
            STREAM_WEBHOOK_SECRET: bindings.secret(),
            STREAM_ACCOUNT_ID: bindings.secret(),
            STREAM_API_TOKEN: bindings.secret(),
            VAPID_PRIVATE_KEY: bindings.secret(),
            APP_ENV: bindings.text("development"),
            PUBLIC_APP_URL: bindings.text("http://localhost:3000"),
            TURNSTILE_SITE_KEY: bindings.text("1x00000000000000000000AA"),
            AUTH_EMAIL_FROM: bindings.text("PistonPost Auth <auth@transactional.pistonmaster.net>"),
            NOTIFICATIONS_EMAIL_FROM: bindings.text(
              "PistonPost <notifications@transactional.pistonmaster.net>",
            ),
            MARKETING_EMAIL_FROM: bindings.text(
              "PistonPost Updates <updates@transactional.pistonmaster.net>",
            ),
            SUPPORT_EMAIL: bindings.text("support@pistonmaster.net"),
            VAPID_PUBLIC_KEY: bindings.text(""),
            VAPID_SUBJECT: bindings.text("mailto:support@pistonmaster.net"),
            ANALYTICS: bindings.analyticsEngineDataset({
              name: "pistonpost_local_events",
            }),
            DB: bindings.d1({
              name: "pistonpost-local",
              id: "5e735af4-a49f-44b7-aedf-45a5a4391291",
            }),
            MEDIA: bindings.r2({
              name: "pistonpost-local-media",
            }),
            EMAIL: bindings.sendEmail({}),
            JOBS: bindings.queue({
              name: "pistonpost-local-jobs",
            }),
            IMAGES: bindings.images({}),
            STREAM: bindings.stream({}),
            ANON_RATE_LIMITER: bindings.rateLimit({
              namespace: "11001",
              simple: {
                limit: 300,
                period: 60,
              },
            }),
            AUTH_RATE_LIMITER: bindings.rateLimit({
              namespace: "11002",
              simple: {
                limit: 20,
                period: 60,
              },
            }),
            USER_RATE_LIMITER: bindings.rateLimit({
              namespace: "11003",
              simple: {
                limit: 120,
                period: 60,
              },
            }),
            COMMENT_RATE_LIMITER: bindings.rateLimit({
              namespace: "11004",
              simple: {
                limit: 20,
                period: 60,
              },
            }),
            REACTION_RATE_LIMITER: bindings.rateLimit({
              namespace: "11005",
              simple: {
                limit: 120,
                period: 60,
              },
            }),
            UPLOAD_RATE_LIMITER: bindings.rateLimit({
              namespace: "11006",
              simple: {
                limit: 30,
                period: 60,
              },
            }),
            IMAGE_UPLOAD_RATE_LIMITER: bindings.rateLimit({
              namespace: "11008",
              simple: {
                limit: 180,
                period: 60,
              },
            }),
            POST_VIEW_RATE_LIMITER: bindings.rateLimit({
              namespace: "11007",
              simple: {
                limit: 1,
                period: 60,
              },
            }),
            ASSETS: bindings.assets(),
            ACCOUNT_DELETION: bindings.workflow({
              name: "pistonpost-local-account-deletion",
              worker: "pistonpost-local",
              exportName: "AccountDeletionWorkflow",
            }),
          },
          exports: {
            AccountDeletionWorkflow: exports.workflow({
              name: "pistonpost-local-account-deletion",
            }),
          },
        },
      })
    }
  }
})
