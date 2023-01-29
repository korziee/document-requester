import { IRequest } from "itty-router";
import { validate } from "uuid";
import { Env } from ".";
import { DOCUMENT_CONFIG } from "./config";

export async function accept(req: IRequest, env: Env) {
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

  if (!DOCUMENT_CONFIG[documentRequest.document_id]) {
    console.error("could not find mapping config for document id", {
      documentId: documentRequest.document_id,
      documentRequestId: documentRequest.id,
    });
  }

  const { r2Key, sendgridTemplateId, contentType } =
    DOCUMENT_CONFIG[documentRequest.document_id];

  // see src/r2-sync.ts for the why I'm hitting D1 instead of R2 here.
  const doc = await env.DB.prepare(
    "select id, version, updated_at, contents_base64 from documents where id = ?"
  )
    .bind(r2Key)
    .first<{
      id: string;
      version: string;
      updated_at: string;
      contents_base64: string;
    }>();

  if (!doc.contents_base64) {
    console.error(
      "the document could not be found inside of r2, has it been synced correctly?",
      {
        documentId: documentRequest.document_id,
        documentRequestId: documentRequest.id,
        r2Key,
      }
    );
    return new Response("something went wrong", { status: 500 });
  }

  console.log(
    `attempting to send document with key: "${r2Key}" which was last updated at: "${doc.updated_at}", having version: "${doc.version}".`
  );

  const email = await fetch("https://api.sendgrid.com/v3/mail/send", {
    body: JSON.stringify({
      from: {
        email: "kory@kory.au",
        name: "Kory Porter",
      },
      personalizations: [
        {
          to: [
            {
              email: documentRequest.email,
            },
          ],
          dynamic_template_data: {
            name: documentRequest.requester_name,
          },
        },
      ],
      template_id: sendgridTemplateId,
      attachments: [
        {
          content: doc.contents_base64,
          filename: r2Key,
          type: contentType,
          disposition: "attachment",
        },
      ],
    }),
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (email.status !== 202) {
    console.error("Email sending has failed", {
      statusText: email.statusText,
      error: await email.json(),
    });
  } else {
    console.log("successfully sent email");
  }

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
}
