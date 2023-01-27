# document-requester

A tool built on Cloudflare's free tier that adds an approval step before someone can access a document

## TODO

- [x] R2 Integration
- [x] D1 Integration
- [x] CRON Integration
- [x] NTFY Integration
- [x] Use itty router
- [x] D1 Schema
- [x] Comments
- [ ] fix sendgrid
- [x] validate email
- [ ] Put actual resume in bucket
- [x] Implement requesting
- [x] Implement accepting
- [x] Implement rejecting
- [ ] scheduling

## Notes

### Cron Testing

Cannot test cron schedule locally because the d1 middleware in mini-flare is incompatible: https://github.com/cloudflare/miniflare/issues/479. Solution is to just comment out the d1 config in wrangler for now.
Can be tested with `yarn wrangler dev --test-scheduled --persist --experimental-local`

### D1 migrations for preview

There isn't yet a good way to run migrations against preview databases, the current workaround as suggested by the team is to manually specify an environment in the wrangler.toml file and then run the migration against that environment which specifies the preview database as the main database for that environment. This is why its commented out in the wrangler.toml. [Source](https://github.com/cloudflare/wrangler2/issues/2446).

To run migrations against the preview database:

1. uncomment the dev env comment in wrangler.toml
2. run: `yarn wrangler d1 migrations apply document-requester-test --env dev`
3. comment out dev env in wrangler.toml
4. winning!
