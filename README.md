# document-requester

A tool built on Cloudflare's free tier that adds an approval step before someone can access a document

## TODO

- [x] R2 Integration
- [x] D1 Integration
- [x] CRON Integration
- [x] NTFY Integration
- [x] Use itty router
- [ ] D1 Schema
- [ ] Put actual resume in bucket

## Note

Cannot test cron schedule locally because the d1 middleware in mini-flare is incompatible: https://github.com/cloudflare/miniflare/issues/479. Solution is to just comment out the d1 config in wrangler for now.
Can be tested with `yarn wrangler dev --test-scheduled --persist --experimental-local`
