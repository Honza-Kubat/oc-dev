import { createPrReviewTools } from "../src/pr-review/tools"
import type { Plugin } from "@opencode-ai/plugin"

const PrReviewPlugin: Plugin = async (ctx) => {
  const { client } = ctx

  await client.app.log({
    body: {
      service: "oc-dev",
      level: "info",
      message: "PR Review plugin initialized",
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

export default PrReviewPlugin
export { PrReviewPlugin }
