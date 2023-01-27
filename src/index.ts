import { router } from "./router";

export interface Env {
  DOCUMENT_BUCKET: R2Bucket;
  DB: D1Database;
  NTFY_TOPIC: string;
  WORKER_URL: string;
  SENDGRID_API_KEY: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // TODO
    // find all unacked older than 24 hours
    //  for each message
    //    publish message to ntfy
    console.log("hey outside!", event.cron, event.scheduledTime, ctx);
    await new Promise((r) => setTimeout(r, 10000));
  },

  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    // note: this order should not change, route handlers are typed to expect env and ctx in this order
    return router.handle(request, env, ctx);
  },
};
