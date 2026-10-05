#!/bin/sh
set -eu

root=$(git rev-parse --show-toplevel)
test "$(git -C "$root" branch --show-current)" = main || { echo 'Deploy Stalwart from main.' >&2; exit 1; }
test -z "$(git -C "$root" status --porcelain)" || { echo 'Mail checkout must be clean.' >&2; exit 1; }
git -C "$root" fetch origin main
git -C "$root" merge --ff-only origin/main

case "$(id -un)" in
    hanasand) default_state=/home/hanasand/hanasand/mail/stalwart ;;
    ubuntu) default_state=/home/ubuntu/hanasand/mail/stalwart ;;
    *) echo 'Run Stalwart deploy as the configured Inspur or OVH service user.' >&2; exit 1 ;;
esac
export HANASAND_STALWART_STATE_DIR=${HANASAND_STALWART_STATE_DIR:-$default_state}
test -d "$HANASAND_STALWART_STATE_DIR" || { echo "Stalwart state directory is missing: $HANASAND_STALWART_STATE_DIR" >&2; exit 1; }
network=${HANASAND_SHARED_NETWORK:-hanasand_hanasandnet}
docker network inspect "$network" >/dev/null 2>&1 || { echo "Required shared Docker network is missing: $network" >&2; exit 1; }
compose() { docker compose --project-name hanasand-mail-stalwart -f "$root/compose.stalwart.yml" "$@"; }

# Build before stopping the existing mail process. Both hosts keep using their
# existing persistent data directories during the Compose ownership transfer.
compose build stalwart
if docker inspect hanasand_mail >/dev/null 2>&1 \
    && [ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' hanasand_mail)" != hanasand-mail-stalwart ]; then
    mounted_state=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/opt/stalwart"}}{{.Source}}{{end}}{{end}}' hanasand_mail)
    test "$mounted_state" = "$HANASAND_STALWART_STATE_DIR" || {
        echo "Existing Stalwart uses $mounted_state; refusing to switch to $HANASAND_STALWART_STATE_DIR." >&2
        exit 1
    }
    docker stop --time 30 hanasand_mail >/dev/null
    docker rm hanasand_mail >/dev/null
fi
compose up -d --no-build stalwart

attempt=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' hanasand_mail 2>/dev/null || true)" = healthy ]; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then docker logs --tail 100 hanasand_mail >&2; exit 1; fi
    sleep 2
done
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8081/healthz/live >/dev/null
printf 'Stalwart deployed from mail repo %s; persistent state remains at %s.\n' \
    "$(git -C "$root" rev-parse HEAD)" "$HANASAND_STALWART_STATE_DIR"
