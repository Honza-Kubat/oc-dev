import type { Plugin } from "@opencode-ai/plugin"
import { createPrReviewTools } from "./pr-review"

export const OcDevPlugin: Plugin = async (ctx) => {
  const { client } = ctx

  await client.app.log({
    body: {
      service: "oc-dev",
      level: "info",
      message: "Plugin initialized",
    },
  })

  const prReviewTools = createPrReviewTools(ctx)

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await client.app.log({
          body: {
            service: "oc-dev",
            level: "debug",
            message: "Session idle",
          },
        })
      }
    },
    tool: prReviewTools,
  }
}

export default OcDevPlugin
