# Hanasand Mail

Standalone webmail client for `mail.hanasand.com`. Mailbox data and actions stay in the Hanasand API; the client forwards the signed-in Hanasand session to that API. Stalwart is an internal mail service and is not the public web UI.

## Development

```sh
bun install
bun run dev
```

The app uses the shared Hanasand `id`, `access_token`, and `theme` cookies. To sign in, it hands unauthenticated visitors to `https://hanasand.com/dashboard/mail`, which returns here after Hanasand login.

## Deploy

Push `main` to the mail repository, fast-forward the server checkout, then run `scripts/deploy.sh` there. This deploys only this app and switches the mail hostname's OpenResty web route after the new app passes its health check. The script leaves SMTP, IMAP, Stalwart state, and the Hanasand API untouched.
