import { IRequest, Router } from "itty-router";
import { v4 as uuidv4 } from "uuid";
import { Env } from ".";

const SUPPORTED_DOCUMENTS: string[] = ["resume"];

// console.log("Bucket contents", await env.RESUME_BUCKET.list());
// const blob = await env.RESUME_BUCKET.get("labels.pdf");
// console.log("labels.pdf", await env.RESUME_BUCKET.get("labels.pdf"));
// return new Response(blob!.body);

// console.log(await env.DB.prepare("PRAGMA table_list").all());
// const prep = env.DB.prepare("SELECT * FROM Customers");
// const all = await prep.all();
// console.log("all", all);

export const router = Router();

router.get("/", async (req, env: Env) => {
  console.log(env);
  // health-check
  return new Response(`ok - ${new Date().toISOString()}`);
});

router.put(
  "/request/:documentId",
  withJsonContent,
  async (req: IRequest, env: Env, ctx: ExecutionContext) => {
    const { email, name } = req.content as { email?: string; name?: string };
    const { documentId } = req.params;

    if (!email) {
      return new Response('"email" is required', { status: 400 });
    }
    if (!name || name.length <= 1) {
      return new Response(
        '"name" is required and must be of a length greater than 1',
        { status: 400 }
      );
    }
    if (!SUPPORTED_DOCUMENTS.includes(documentId)) {
      return new Response(`"${documentId}" is not a supported document`, {
        status: 400,
      });
    }

    const exists = await env.DB.prepare(
      "select id from document_requests where email = ? and document_id = ? and status = 'REQUESTED'"
    )
      .bind(email, documentId)
      .first<{ id: string }>();

    if (exists) {
      console.log(
        `request for "${documentId}" for user with email: "${email}" already exists in the requested state, stopping`
      );
      return new Response("ok", {
        status: 202,
      });
    }

    const insert = await env.DB.prepare(
      "insert into document_requests(id, document_id, email, requester_name, status) values (?, ?, ?, ?, 'REQUESTED') returning id"
    )
      .bind(uuidv4(), documentId, email, name)
      .all<{ id: string }>();

    if (!insert.results || !insert.success) {
      console.error("Unable to insert request", {
        insert: JSON.stringify(insert, null, 2),
        email,
        name,
        documentId,
      });

      return new Response("unable to insert request", { status: 500 });
    }

    const requestId = insert.results[0].id;

    console.log(
      `created document request for "${email}" into d1 with id: ${requestId}"`
    );

    const resp = await fetch(`https://ntfy.sh/`, {
      method: "POST",
      body: JSON.stringify({
        topic: env.NTFY_TOPIC,
        message: `${name}(${email}) has requested access to "${documentId}"`,
        priority: 3, // default
        tags: ["page_facing_up"],
        actions: [
          {
            action: "http",
            label: "Accept",
            url: `${env.WORKER_URL}/accept/${requestId}`,
          },
          {
            action: "http",
            label: "Reject",
            url: `${env.WORKER_URL}/reject/${requestId}`,
          },
        ],
      }),
    });

    if (resp.status !== 200) {
      console.error("there was an error publishing to ntfy", {
        status: resp.status,
        body: JSON.stringify(await resp.json(), null, 2),
        email,
        name,
        documentId,
        requestId,
      });
    }

    return new Response("ok", { status: 202 });
  }
);

router.put(
  "/accept/:requestId",
  async (req, env: Env, ctx: ExecutionContext) => {
    console.log("accepted", req.params);
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
    console.log("rejected", req.params);
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

async function withJsonContent(request: IRequest) {
  request.content = {};
  let contentType = request.headers.get("content-type");

  try {
    if (contentType && contentType.includes("application/json")) {
      request.content = await request.json();
    }
  } catch (err) {}
}
