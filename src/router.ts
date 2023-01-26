import { IRequest, Router } from "itty-router";
import { validate as validateEmail } from "email-validator";
import { v4 as uuidv4, validate } from "uuid";
import { Env } from ".";

const SUPPORTED_DOCUMENTS: string[] = ["resume"];

const DOCUMENT_FILE_NAMES: Record<string, string> = {
  resume: "resume.pdf",
};

export const router = Router();

router.get("/", async (req, env: Env) => {
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
    if (!validateEmail(email)) {
      return new Response('"email" is invalid', { status: 400 });
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
            method: "PUT", // endpoint expects put!
            clear: true, // removes notification from ntfy app after successful action, note: this doesn't work in iOS 🤦‍♂️
            url: `${env.WORKER_URL}/accept/${requestId}`,
          },
          {
            action: "http",
            label: "Reject",
            method: "PUT", // endpoint expects put!
            clear: true, // removes notification from ntfy app after successful action, note: this doesn't work in iOS 🤦‍♂️
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
  async (req: IRequest, env: Env, ctx: ExecutionContext) => {
    const { requestId } = req.params;

    if (!validate(requestId)) {
      return new Response(`"${requestId}" was expected to be a uuid`, {
        status: 400,
      });
    }

    const res = await env.DB.prepare(
      `select id, status, document_id from document_requests where id = ?`
    )
      .bind(requestId)
      .first<{
        id: string;
        status: "REQUESTED" | "REJECTED" | "ACCEPTED";
        document_id: string;
      }>();

    if (!res) {
      return new Response(`invalid requestId provided: "${requestId}"`, {
        status: 404,
      });
    }

    if (res.status === "REJECTED") {
      return new Response(`"${requestId}" has already been rejected`, {
        status: 400,
      });
    }

    if (res.status === "ACCEPTED") {
      return new Response("ok", { status: 202 });
    }

    if (res.status !== "REQUESTED") {
      console.error("unexpected status", {
        status: res.status,
        documentRequestId: res.id,
      });
      return new Response("something went wrong", { status: 500 });
    }

    const fileName = DOCUMENT_FILE_NAMES[res.document_id];

    if (!fileName) {
      console.error("could not find mapping file name for document id", {
        documentId: res.document_id,
        documentRequestId: res.id,
      });
      return new Response("something went wrong", { status: 500 });
    }

    const document = await env.DOCUMENT_BUCKET.get(
      DOCUMENT_FILE_NAMES[res.document_id]
    );

    if (!document) {
      console.error("the document could not be found", {
        documentId: res.document_id,
        documentRequestId: res.id,
        fileName,
      });
      return new Response("something went wrong", { status: 500 });
    }

    // TODO
    // Logic
    //    send success email to sendgrid
    //      using request id as idempotency key
    //      attaching document as a stream

    const update = await env.DB.prepare(
      "update document_requests set status = 'ACCEPTED' where id = ?"
    )
      .bind(requestId)
      .run();

    if (!update.success) {
      console.error(
        "update was not successful, manual intervention required as email has already been sent",
        {
          requestId,
          update,
        }
      );
      return new Response("update not successful", { status: 500 });
    }

    // return new Response(document!.body);
    return new Response("ok", { status: 202 });
  }
);

router.put(
  "/reject/:requestId",
  async (req, env: Env, ctx: ExecutionContext) => {
    const { requestId } = req.params;

    if (!validate(requestId)) {
      return new Response(`"${requestId}" was expected to be a uuid`, {
        status: 400,
      });
    }

    const res = await env.DB.prepare(
      `select id, status, document_id from document_requests where id = ?`
    )
      .bind(requestId)
      .first<{
        id: string;
        status: "REQUESTED" | "REJECTED" | "ACCEPTED";
        document_id: string;
      }>();

    if (!res) {
      return new Response(`invalid requestId provided: "${requestId}"`, {
        status: 404,
      });
    }

    if (res.status === "REJECTED") {
      return new Response("ok", { status: 202 });
    }

    if (res.status === "ACCEPTED") {
      return new Response(
        `"${requestId}" has already been accepted, can't reject now`,
        {
          status: 400,
        }
      );
    }

    if (res.status !== "REQUESTED") {
      console.error("unexpected status", {
        status: res.status,
        documentRequestId: res.id,
      });
      return new Response("something went wrong", { status: 500 });
    }

    // TODO
    // Logic
    //    send rejection email to sendgrid
    //      using request id as idempotency key

    const update = await env.DB.prepare(
      "update document_requests set status = 'REJECTED' where id = ?"
    )
      .bind(requestId)
      .run();

    if (!update.success) {
      console.error(
        "update was not successful, manual intervention required as rejection email has already been sent",
        {
          requestId,
          update,
        }
      );
      return new Response("update not successful", { status: 500 });
    }

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
