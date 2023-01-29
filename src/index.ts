import { IRequest, Router } from "itty-router";
import { createCors } from "itty-cors";

import { request } from "./request";
import { accept } from "./accept";
import { reject } from "./reject";

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

// health-check
router.get("/", () => new Response(`ok - ${new Date().toISOString()}`));
router.put("/request/:documentId", withJsonContent, request);
router.put("/accept/:requestId", accept);
router.put("/reject/:requestId", reject);

// .all is default handler, so 404 for everything else
router.all("*", () => new Response("Not Found.", { status: 404 }));

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
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
  NTFY_TOPIC: string;
  WORKER_URL: string;
  SENDGRID_API_KEY: string;
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
