# Hanasand Mail

Standalone webmail client and mail service deployment for Hanasand. The `mail-relay/` directory contains the SMTP relay, connector, health checks, gateway configuration and setup tools. Mailbox data and actions stay in the Hanasand API; the client forwards the signed-in Hanasand session to that API.

## Development

```sh
bun install
bun run dev
```

The app uses the shared Hanasand `id`, `access_token`, and `theme` cookies. To sign in, it hands unauthenticated visitors to `https://hanasand.com/dashboard/mail`, which returns here after Hanasand login.

## Deploy

Push `main` to the mail repository, fast-forward the server checkout, then run `scripts/deploy.sh` there. This deploys only the web app and switches the mail hostname's OpenResty web route after the new app passes its health check.

## Stalwart and SMTP relay

`compose.stalwart.yml` defines the main Stalwart server and the OVH relay, both relay health services, the Inspur SSH connector and the OVH inbound gateway. The relay services are profile-gated so app and Stalwart deployments do not start them. `mail-relay/setup.ts` applies the host-specific configuration, then uses these Compose services to build and run the relay containers. Existing Stalwart data and relay secrets remain in their current host directories during the move.

Run relay setup from this repository's checkout after updating `main`. On OVH, build and start the private relay and its health service with `bun mail-relay/setup.ts ovh --image hanasand-mail-relay-health:<revision>`. On Inspur, use `bun mail-relay/setup.ts inspur --image hanasand-mail-relay-health:<revision> --api-container <active-api-container>`. Run `bun mail-relay/setup.ts ovh --configure-gateway` on OVH and `bun mail-relay/setup.ts inspur --configure-gateway` on Inspur after the corresponding services are healthy. Activate external routing only with `bun mail-relay/setup.ts inspur --activate` after relay authentication passes.

The existing relay state defaults to `$HOME/hanasand/mail/mail-relay`; set `HANASAND_MAIL_RELAY_ROOT` when a host stores it elsewhere. The Inspur connector keeps its existing address on the shared Docker network during the Compose migration.
