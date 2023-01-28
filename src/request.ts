import { IRequest } from "itty-router";
import { Env } from ".";
import { validate as validateEmail } from "email-validator";
import { v4 as uuidv4 } from "uuid";

const SUPPORTED_DOCUMENTS: string[] = ["resume"];

export async function request(req: IRequest, env: Env) {
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
