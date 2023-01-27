import sendgrid from "@sendgrid/mail";
import { IRequest, Router } from "itty-router";
import { validate as validateEmail } from "email-validator";
import { v4 as uuidv4, validate } from "uuid";
import { Env } from ".";

const SUPPORTED_DOCUMENTS: string[] = ["resume"];
const DOCUMENT_CONFIG: Record<
  string,
  { r2Key: string; sendgridTemplateId: string }
> = {
  resume: {
    r2Key: "koryporter-resume.pdf",
    sendgridTemplateId: "d-1b5cd82e87f54ed2b5773def8871e884",
  },
};

export const router = Router();

router.get("/", async () => {
  // health-check
  return new Response(`ok - ${new Date().toISOString()}`);
});

router.put(
  "/request/:documentId",
  withJsonContent,
  async (req: IRequest, env: Env) => {
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

router.put("/accept/:requestId", async (req: IRequest, env: Env) => {
  const { requestId } = req.params;

  if (!validate(requestId)) {
    return new Response(`"${requestId}" was expected to be a uuid`, {
      status: 400,
    });
  }

  const documentRequest = await env.DB.prepare(
    `select id, status, document_id, email, requester_name from document_requests where id = ?`
  )
    .bind(requestId)
    .first<{
      id: string;
      status: "REQUESTED" | "REJECTED" | "ACCEPTED";
      email: string;
      requester_name: string;
      document_id: string;
    }>();

  if (!documentRequest) {
    return new Response(`invalid requestId provided: "${requestId}"`, {
      status: 404,
    });
  }

  if (documentRequest.status === "REJECTED") {
    return new Response(`"${requestId}" has already been rejected`, {
      status: 400,
    });
  }

  if (documentRequest.status === "ACCEPTED") {
    return new Response("ok", { status: 202 });
  }

  if (documentRequest.status !== "REQUESTED") {
    console.error("unexpected status", {
      status: documentRequest.status,
      documentRequestId: documentRequest.id,
    });
    return new Response("something went wrong", { status: 500 });
  }

  const { r2Key, sendgridTemplateId } =
    DOCUMENT_CONFIG[documentRequest.document_id];

  if (!r2Key) {
    console.error("could not find mapping file name for document id", {
      documentId: documentRequest.document_id,
      documentRequestId: documentRequest.id,
    });
    return new Response("something went wrong", { status: 500 });
  }

  if (!sendgridTemplateId) {
    console.error("could not find sendgrid template id for document id", {
      documentId: documentRequest.document_id,
      documentRequestId: documentRequest.id,
    });
    return new Response("something went wrong", { status: 500 });
  }

  const document = await env.DOCUMENT_BUCKET.get(r2Key);

  if (!document) {
    console.error("the document could not be found", {
      documentId: documentRequest.document_id,
      documentRequestId: documentRequest.id,
      r2Key,
    });
    return new Response("something went wrong", { status: 500 });
  }

  const buf = await document.arrayBuffer();

  sendgrid.setApiKey(env.SENDGRID_API_KEY);
  const emailResponse = await sendgrid.send({
    to: documentRequest.email,
    from: "kory@kory.au",
    templateId: sendgridTemplateId,
    attachments: [
      {
        filename: r2Key,
        disposition: "attachment",
        type: "application/pdf",
        content: Buffer.from(buf).toString("base64"),
      },
    ],
    dynamicTemplateData: {
      name: documentRequest.requester_name,
    },
  });

  // TODO (test the next logic)
  // Logic
  //    send success email to sendgrid
  //      using request id as idempotency key
  //      attaching document as a stream
  console.log("res", emailResponse);

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

  return new Response("ok", { status: 202 });
});

router.put("/reject/:requestId", async (req, env: Env) => {
  const { requestId } = req.params;

  if (!validate(requestId)) {
    return new Response(`"${requestId}" was expected to be a uuid`, {
      status: 400,
    });
  }

  const documentRequest = await env.DB.prepare(
    `select id, status, document_id, email, name from document_requests where id = ?`
  )
    .bind(requestId)
    .first<{
      id: string;
      status: "REQUESTED" | "REJECTED" | "ACCEPTED";
      document_id: string;
      email: string;
      name: string;
    }>();

  if (!documentRequest) {
    return new Response(`invalid requestId provided: "${requestId}"`, {
      status: 404,
    });
  }

  if (documentRequest.status === "REJECTED") {
    return new Response("ok", { status: 202 });
  }

  if (documentRequest.status === "ACCEPTED") {
    return new Response(
      `"${requestId}" has already been accepted, can't reject now`,
      {
        status: 400,
      }
    );
  }

  if (documentRequest.status !== "REQUESTED") {
    console.error("unexpected status", {
      status: documentRequest.status,
      documentRequestId: documentRequest.id,
    });
    return new Response("something went wrong", { status: 500 });
  }

  // TODO (test)
  // Logic
  //    send rejection email to sendgrid
  //      using request id as idempotency key

  sendgrid.setApiKey(env.SENDGRID_API_KEY);
  const emailResponse = await sendgrid.send({
    to: documentRequest.email,
    from: "kory@kory.au",
    content: [
      {
        type: "text/html",
        value: `<p>Hey sorry ${documentRequest.name}, I'm unable to release this document to you. Feel free to respond to this email if you think theres been a mistake.</p>`,
      },
    ],
    subject: "Document was not released",
  });

  console.log("emailResponse", emailResponse);

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
});

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
