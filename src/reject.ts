import { IRequest } from "itty-router";
import { validate } from "uuid";
import { Env } from ".";
import { GENERIC_REJECTION_SENDGRID_TEMPLATE_ID } from "./config";

export async function reject(req: IRequest, env: Env) {
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
      document_id: string;
      email: string;
      requester_name: string;
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
      template_id: GENERIC_REJECTION_SENDGRID_TEMPLATE_ID,
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
