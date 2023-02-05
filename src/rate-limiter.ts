import { Env } from ".";

const RATE_LIMIT = 100;

export async function rateLimiter(req: Request, env: Env) {
  const ip = req.headers.get("cf-connecting-ip");
  if (!ip) {
    console.log(new Map(req.headers));
    throw new Error("something went wrong, couldn't find ip address!");
  }

  const response = await env.KV.get(`limit:${ip}`);
  const hits = response ? parseInt(response) : 0;

  if (hits >= RATE_LIMIT) {
    throw new Error(`ip: "${ip}" is over the rate limit`);
  }

  // 100 reqs every 10 mins should be PLENTY for this document requester.
  env.KV.put(`limit:${ip}`, `${hits + 1}`, { expirationTtl: 10 * 60 });
}
