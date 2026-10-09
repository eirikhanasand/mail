# Hanasand Mail

Standalone webmail client for Hanasand. Mailbox data and actions stay in the Hanasand API; the client forwards the signed-in Hanasand session to that API.

## Development

```sh
bun install
bun run dev
```

The app uses the shared Hanasand `id`, `access_token`, and `theme` cookies. To sign in, it hands unauthenticated visitors to `https://hanasand.com/dashboard/mail`, which returns here after Hanasand login.

## Deploy

Push `main` to the mail repository, fast-forward the server checkout, then run `scripts/deploy.sh` there. This deploys only the web app and switches the mail hostname's OpenResty web route after the new app passes its health check.

The Stalwart server and SMTP relay have their own [Stalwart repository](https://github.com/hanasandcom/stalwart) and Compose deployment.
