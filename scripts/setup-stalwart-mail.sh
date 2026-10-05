#!/usr/bin/env bash
set -euo pipefail

MAIL_HOSTNAME="${MAIL_HOSTNAME:-mail.hanasand.com}"
MAIL_DOMAIN="${MAIL_DOMAIN:-hanasand.com}"
MAIL_ACCOUNT="${MAIL_ACCOUNT:-eirik}"
MAIL_ADDRESS="${MAIL_ADDRESS:-contact@hanasand.com}"
MAIL_ACCOUNT_PASSWORD="${MAIL_ACCOUNT_PASSWORD:?MAIL_ACCOUNT_PASSWORD must be set}"
MAIL_HTTP_LOCAL_PORT="${MAIL_HTTP_LOCAL_PORT:-8081}"
STALWART_CONTAINER="${STALWART_CONTAINER:-hanasand_mail}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
case "$(id -un)" in
    hanasand) default_state=/home/hanasand/hanasand/mail/stalwart; default_env=/home/hanasand/hanasand/.env ;;
    ubuntu) default_state=/home/ubuntu/hanasand/mail/stalwart; default_env=/home/ubuntu/hanasand/.env ;;
    *) default_state="$REPO_ROOT/data/stalwart"; default_env="$REPO_ROOT/.env" ;;
esac
STALWART_VOLUME_DIR="${STALWART_VOLUME_DIR:-$default_state}"
ENV_FILE="${ENV_FILE:-$default_env}"
MAIL_TLS_CERT_SOURCE="${MAIL_TLS_CERT_SOURCE:-/etc/letsencrypt/live/hanasand.com/fullchain.pem}"
MAIL_TLS_KEY_SOURCE="${MAIL_TLS_KEY_SOURCE:-/etc/letsencrypt/live/hanasand.com/privkey.pem}"
MAIL_TLS_CERT_TARGET="${MAIL_TLS_CERT_TARGET:-${STALWART_VOLUME_DIR}/certs/fullchain.pem}"
MAIL_TLS_KEY_TARGET="${MAIL_TLS_KEY_TARGET:-${STALWART_VOLUME_DIR}/certs/privkey.pem}"

wait_for_http() {
    local attempts=0
    until curl -fsS "http://127.0.0.1:${MAIL_HTTP_LOCAL_PORT}/jmap/session" >/dev/null 2>&1; do
        attempts=$((attempts + 1))
        if [ "$attempts" -gt 60 ]; then
            echo "Stalwart did not become ready on port ${MAIL_HTTP_LOCAL_PORT}."
            exit 1
        fi
        sleep 2
    done
}

extract_admin_password() {
    docker logs "${STALWART_CONTAINER}" 2>&1 | sed -n "s/.*password '\([^']*\)'.*/\1/p" | tail -n 1
}

extract_admin_password_from_env() {
    if [ -f "${ENV_FILE}" ]; then
        sed -n 's/^MAIL_ADMIN_PASSWORD=//p' "${ENV_FILE}" | tail -n 1
    fi
}

api() {
    local method="$1"
    local path="$2"
    local body="${3:-}"
    if [ -n "$body" ]; then
        curl -fsS -u "admin:${ADMIN_PASSWORD}" -H 'Content-Type: application/json' -H 'Accept: application/json' -X "$method" "http://127.0.0.1:${MAIL_HTTP_LOCAL_PORT}${path}" -d "$body"
    else
        curl -fsS -u "admin:${ADMIN_PASSWORD}" -H 'Accept: application/json' -X "$method" "http://127.0.0.1:${MAIL_HTTP_LOCAL_PORT}${path}"
    fi
}

ensure_principal() {
    local name="$1"
    local type="$2"
    local body="$3"

    local principal_id
    principal_id="$(api GET '/api/principal?limit=500' | jq -r --arg name "$name" --arg type "$type" '.data.items[]? | select(.name == $name and .type == $type) | .id' | head -n 1)"

    if [ -n "${principal_id}" ]; then
        echo "Principal ${type}:${name} already exists (${principal_id})."
        return 0
    fi

    api POST '/api/principal' "$body" >/dev/null
    echo "Created principal ${type}:${name}."
}

mkdir -p "${STALWART_VOLUME_DIR}"
wait_for_http

ADMIN_PASSWORD="$(extract_admin_password)"
if [ -z "${ADMIN_PASSWORD}" ]; then
    ADMIN_PASSWORD="$(extract_admin_password_from_env)"
fi

if [ -z "${ADMIN_PASSWORD}" ]; then
    echo "Unable to determine the Stalwart admin password from container logs or ${ENV_FILE}."
    exit 1
fi

if [ -f "${ENV_FILE}" ]; then
    if grep -q '^MAIL_ADMIN_PASSWORD=' "${ENV_FILE}"; then
        sed -i "s|^MAIL_ADMIN_PASSWORD=.*|MAIL_ADMIN_PASSWORD=${ADMIN_PASSWORD}|" "${ENV_FILE}"
    else
        printf '\nMAIL_ADMIN_PASSWORD=%s\n' "${ADMIN_PASSWORD}" >> "${ENV_FILE}"
    fi
fi

if [ -f "${MAIL_TLS_CERT_SOURCE}" ] && [ -f "${MAIL_TLS_KEY_SOURCE}" ]; then
    mkdir -p "$(dirname "${MAIL_TLS_CERT_TARGET}")"
    sudo cp "${MAIL_TLS_CERT_SOURCE}" "${MAIL_TLS_CERT_TARGET}"
    sudo cp "${MAIL_TLS_KEY_SOURCE}" "${MAIL_TLS_KEY_TARGET}"
    sudo chown "${USER}:${USER}" "${MAIL_TLS_CERT_TARGET}" "${MAIL_TLS_KEY_TARGET}"
    chmod 600 "${MAIL_TLS_CERT_TARGET}" "${MAIL_TLS_KEY_TARGET}"
fi

if docker exec "${STALWART_CONTAINER}" sh -lc 'command -v stalwart-cli >/dev/null 2>&1'; then
    docker exec "${STALWART_CONTAINER}" sh -lc "stalwart-cli -u http://127.0.0.1:8080 -c admin:${ADMIN_PASSWORD} server add-config server.hostname ${MAIL_HOSTNAME}" >/dev/null || true
    docker exec "${STALWART_CONTAINER}" sh -lc "stalwart-cli -u http://127.0.0.1:8080 -c admin:${ADMIN_PASSWORD} server add-config http.url https://${MAIL_HOSTNAME}" >/dev/null || true
    docker exec "${STALWART_CONTAINER}" sh -lc "stalwart-cli -u http://127.0.0.1:8080 -c admin:${ADMIN_PASSWORD} server reload-config" >/dev/null || true
    if [ -f "${MAIL_TLS_CERT_TARGET}" ] && [ -f "${MAIL_TLS_KEY_TARGET}" ]; then
        docker exec "${STALWART_CONTAINER}" sh -lc "stalwart-cli -u http://127.0.0.1:8080 -c admin:${ADMIN_PASSWORD} server add-config certificate.default.cert '%{file:/opt/stalwart/certs/fullchain.pem}%'" >/dev/null || true
        docker exec "${STALWART_CONTAINER}" sh -lc "stalwart-cli -u http://127.0.0.1:8080 -c admin:${ADMIN_PASSWORD} server add-config certificate.default.private-key '%{file:/opt/stalwart/certs/privkey.pem}%'" >/dev/null || true
        docker exec "${STALWART_CONTAINER}" sh -lc "stalwart-cli -u http://127.0.0.1:8080 -c admin:${ADMIN_PASSWORD} server add-config certificate.default.default true" >/dev/null || true
        docker exec "${STALWART_CONTAINER}" sh -lc "stalwart-cli -u http://127.0.0.1:8080 -c admin:${ADMIN_PASSWORD} server reload-certificates" >/dev/null || true
    fi
fi

ensure_principal "${MAIL_DOMAIN}" "domain" "$(jq -nc --arg name "${MAIL_DOMAIN}" '{type:"domain",quota:0,name:$name,description:"Hanasand mail domain",secrets:[],emails:[],urls:[],memberOf:[],roles:[],lists:[],members:[],enabledPermissions:[],disabledPermissions:[],externalMembers:[]}')"
ensure_principal "${MAIL_ACCOUNT}" "individual" "$(jq -nc --arg name "${MAIL_ACCOUNT}" --arg email "${MAIL_ADDRESS}" --arg secret "${MAIL_ACCOUNT_PASSWORD}" '{type:"individual",quota:0,name:$name,description:"Primary Hanasand mailbox",secrets:[$secret],emails:[$email],urls:[],memberOf:[],roles:["user"],lists:[],members:[],enabledPermissions:[],disabledPermissions:[],externalMembers:[]}')"

api POST '/api/dkim' "$(jq -nc --arg domain "${MAIL_DOMAIN}" '{id:null,algorithm:"Ed25519",domain:$domain,selector:null}')" >/dev/null || true

if docker exec "${STALWART_CONTAINER}" sh -lc 'command -v stalwart-cli >/dev/null 2>&1'; then
    docker exec "${STALWART_CONTAINER}" sh -lc "stalwart-cli -u http://127.0.0.1:8080 -c admin:${ADMIN_PASSWORD} dkim create rsa ${MAIL_DOMAIN} rsa-${MAIL_DOMAIN} 202604r" >/dev/null || true
fi

echo
echo "DNS records suggested by Stalwart for ${MAIL_DOMAIN}:"
api GET "/api/dns/records/${MAIL_DOMAIN}" | jq -r '.data[] | "\(.type)\t\(.name)\t\(.content // .value // "")"'
