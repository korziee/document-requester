import { Env } from ".";

/**
 * Syncs content from R2 into D1. Why? Good question.
 *
 * Cloudflare Workers on the free tier give you a 10ms CPU time run time, if you go over
 * your request may be dropped. Sendgrid expects a base 64 encoded binary string
 * to be provided to them for any attachments, so I was needing to read the file from r2,
 * convert to an array buffer, build a string of the contents of the buffer, and then
 * convert to a base 64 string, this was spiking CPU upto 50ms, which means the request could be dropped.
 * To get around this I instead occasionally sync the contents of the bucket into
 * D1. Should be able to get away with this for ages, D1 has a database limit of 100MB, no
 * row limits.
 *
 * The intent behind this project was for people to request my resume,
 * I don't want that to be flaky. I don't mind if the syncing is flaky, it runs on a 15 min cron schedule
 * so if it fails it'll clean itself up (and probably work the next time)
 */
export async function sync(env: Env) {
  const r2List = await env.DOCUMENT_BUCKET.list();
  const { results } = await env.DB.prepare(
    `select id, version from documents;`
  ).all<{ id: string; version: string }>();

  const objectsToSync = r2List.objects.filter((o) => {
    const match = results?.find((r) => r.id === o.key);

    return !match || o.version !== match.version;
  });

  console.log(`attempting to sync ${objectsToSync.length} objects`);

  const syncResult = await Promise.allSettled(
    objectsToSync.map(async (o) => {
      console.log(`beginning sync for "${o.key}"`);
      const body = await env.DOCUMENT_BUCKET.get(o.key);
      if (!body) {
        throw new Error(
          `could not find object in r2 for key: "${o.key}", yet there was a listing for it`
        );
      }

      const buf = await body.arrayBuffer();

      let binaryString = "";
      new Uint8Array(buf).forEach((byte) => {
        binaryString += String.fromCharCode(byte);
      });

      await env.DB.prepare(
        "insert or replace into documents (id, version, contents_base64, updated_at) values (?, ?, ?, ?)"
      )
        .bind(o.key, o.version, btoa(binaryString), new Date().toISOString())
        .all();

      console.log(`finished sync for "${o.key}"`);
    })
  );

  syncResult.forEach((r) => {
    if (r.status === "rejected") {
      console.error("failed to sync an object", r.reason);
    }
  });

  console.log("syncing complete");
  return syncResult;
}
