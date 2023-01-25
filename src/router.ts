import { Router } from "itty-router";
import { Env } from ".";

// console.log(env.NTFY_TOPIC);
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

export const router = Router();

router.get("/", async () => {
  // health-check
  return new Response(`ok - ${new Date().toISOString()}`);
});

router.put(
  "/request/:documentId",
  async (req, env: Env, ctx: ExecutionContext) => {
    // TODO
    // Validation
    //  email exists and is email
    //  name exists and is > 1 char
    //  document-id is one we support (resume)
    // Logic
    //  if email has already requested document and is status=REQUESTED, return 202.
    //  create row in document_requests table
    //  fire off message to ntfy topic
    //  return 202
    return new Response("ok");
  }
);

router.put(
  "/accept/:requestId",
  async (req, env: Env, ctx: ExecutionContext) => {
    // TODO
    // Validation
    //  request id exists
    //  if request status is rejected, return 400.
    // Logic
    //  if request status is already accepted, return 202.
    //  if request status is requested
    //    pull down document from r2
    //    send success email to sendgrid
    //      using request id as idempotency key
    //      attaching document as a stream
    //    update request to be accepted
    return new Response("ok");
  }
);

router.put(
  "/reject/:requestId",
  async (req, env: Env, ctx: ExecutionContext) => {
    // TODO
    // Validation
    //  request id exists
    //  if request status is accepted, return 400.
    // Logic
    //  if request status is already rejected, return 202.
    //  if request status is requested
    //    send rejection email to sendgrid
    //      using request id as idempotency key
    //    update request to be rejected
    return new Response("ok");
  }
);

// .all is default handler, so 404 for everything else
router.all("*", () => new Response("Not Found.", { status: 404 }));
