import { Router } from "itty-router";
import { Env } from ".";

export const router = Router();

router.get("/", async (req, env: Env, ctx: ExecutionContext) => {
  console.log(req);
  console.log(env);
  console.log(ctx);
  return new Response("ok");
});

// .all is default handler, so 404 for everything else
router.all("*", () => new Response("Not Found.", { status: 404 }));
