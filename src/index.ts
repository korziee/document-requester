import { IRequest, Router } from "itty-router";
import { createCors } from "itty-cors";

import { request } from "./request";
import { accept } from "./accept";
import { reject } from "./reject";
import { rateLimiter } from "./rate-limiter";
import { sync } from "./r2-sync";

const { preflight, corsify } = createCors({
  origins: [
    "https://koryporter.com",
    "https://test.koryporter.com",
    "http://localhost:3000",
  ],
  methods: ["GET", "PUT", "OPTIONS"],
});

export const router = Router();

router.all("*", preflight as any);
router.get("/", () => new Response(`ok - ${new Date().toISOString()}`));
router.put("/request/:documentId", withJsonContent, request);
router.put("/accept/:requestId", accept);
router.put("/reject/:requestId", reject);
router.get("/sync", async (_req, env: Env) => {
  const headers = _req.headers as Headers;
  const auth = headers.get("Authorization");

  if (auth !== env.FORCE_SYNC_KEY) {
    return new Response("bad auth", { status: 401 });
  }

  const syncResult = await sync(env);
  return new Response(JSON.stringify({ syncResult }), {
    headers: {
      "content-type": "application/json",
    },
    status: syncResult.find((a) => a.status === "rejected") ? 500 : 200,
  });
});

// .all is default handler, so 404 for everything else
router.all("*", () => new Response("Not Found.", { status: 404 }));

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    async function exec() {
      await sync(env);
    }
    ctx.waitUntil(exec());
  },

  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      await rateLimiter(request, env);
    } catch (e) {
      console.error(e);
      if (e instanceof Error) {
        return new Response("Rate limit has been hit, stop it", {
          status: 429,
        });
      }
    }

    // note: this order should not change, route handlers are typed to expect env and ctx in this order
    return router
      .handle(request, env, ctx)
      .catch((err) => {
        console.error(err);
        return new Response("An unknown error occurred", { status: 500 });
      })
      .then(corsify);
  },
};

export interface Env {
  DOCUMENT_BUCKET: R2Bucket;
  DB: D1Database;
  KV: KVNamespace;
  NTFY_TOPIC: string;
  WORKER_URL: string;
  SENDGRID_API_KEY: string;
  FORCE_SYNC_KEY: string;
}

/**
 * Appends json body to request.content if it exists
 */
async function withJsonContent(request: IRequest) {
  request.content = {};
  let contentType = request.headers.get("content-type");

  try {
    if (contentType && contentType.includes("application/json")) {
      request.content = await request.json();
    }
  } catch (err) {}
}
