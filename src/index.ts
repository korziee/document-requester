/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { router } from "./router";

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  RESUME_BUCKET: R2Bucket;
  DB: D1Database;
  NTFY_TOPIC: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
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
    console.log(env.NTFY_TOPIC);
    // const resp = await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
    //   method: "POST",
    //   body: "Test message!",
    //   headers: {
    //     Title: "Unauthorized access detected",
    //     Priority: "urgent",
    //     Tags: "warning,skull",
    //   },
    // });

    // console.log("Bucket contents", await env.RESUME_BUCKET.list());
    // const blob = await env.RESUME_BUCKET.get("labels.pdf");
    // console.log("labels.pdf", await env.RESUME_BUCKET.get("labels.pdf"));
    // return new Response(blob!.body);

    // console.log(await env.DB.prepare("PRAGMA table_list").all());
    // const prep = env.DB.prepare("SELECT * FROM Customers");
    // const all = await prep.all();
    // console.log("all", all);

    return new Response("hello world");
  },
};
