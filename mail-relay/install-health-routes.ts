#!/usr/bin/env bun
/** Expose relay readiness independently of application/database failover. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const SITES = { inspur: ['128.39.142.218', 19261], ovh: ['192.99.32.185', 19262] } as const
export const INCLUDE = '    include snippets/mail-relay-health.conf;'
type Site = keyof typeof SITES
export function routes(site: Site, revision: string) {
    if (!(site in SITES) || !/^[0-9a-f]{40}$/.test(revision)) throw new Error('Known site and full pushed revision required')
    const blocks: string[] = []
    for (const target of Object.keys(SITES) as Site[]) {
        const [address, port] = SITES[target]
        const endpoint = target === site ? `http://127.0.0.1:${port}/health` : `https://${address}/api/mail-relay/${target}/health`
        const tls = target === site ? '' : `
        proxy_ssl_server_name on;
        proxy_ssl_name api.hanasand.com;
        proxy_ssl_verify on;
        proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
        proxy_ssl_verify_depth 3;`
        blocks.push(`    location = /api/mail-relay/${target}/health {
        limit_except GET { deny all; }
        limit_req zone=mail_relay_health burst=10 nodelay;
        limit_req_status 429;
        proxy_pass ${endpoint};
        proxy_method GET;
        proxy_pass_request_headers off;
        proxy_pass_request_body off;
        proxy_set_header Host api.hanasand.com;
        proxy_set_header Content-Length "";
        proxy_connect_timeout 2s;
        proxy_send_timeout 3s;
        proxy_read_timeout 3s;
        proxy_cache off;
        proxy_intercept_errors off;
        proxy_hide_header Cache-Control;
        proxy_hide_header X-Mail-Relay-Health-Release;
        add_header Cache-Control "no-store" always;
        add_header X-Mail-Relay-Health-Release "${revision}" always;
        error_page 502 504 =503 @mail_relay_health_unavailable;${tls}
    }`)
    }
    blocks.push(`    location @mail_relay_health_unavailable {
        default_type application/json;
        add_header Cache-Control "no-store" always;
        add_header X-Mail-Relay-Health-Release "${revision}" always;
        return 503 '{"ok":false,"summary":"Mail relay health is unavailable."}';
    }`)
    return blocks.join('\n') + '\n'
}

export function includeRoutes(source: string) {
    const blocks = source.split(/(?<=\n})\s*(?=server \{)/)
    let matched = 0
    for (let i = 0; i < blocks.length; i++) {
        if (/listen\s+443\s+ssl/.test(blocks[i]) && /server_name\s+api\.hanasand\.com;/.test(blocks[i])) {
            matched++
            if (!blocks[i].includes(INCLUDE.trim())) blocks[i] = blocks[i].replace('server_name api.hanasand.com;', `server_name api.hanasand.com;\n${INCLUDE}`)
        }
    }
    if (matched !== 1) throw new Error('Expected exactly one public API TLS virtual host')
    return blocks.join('\n\n')
}

const docker = (args: string[], allowFailure = false) => {
    const result = spawnSync('docker', args, { encoding: 'utf8', stdio: 'inherit' })
    if (!allowFailure && result.status !== 0) throw new Error(`${args.join(' ')} failed`)
}
export function install(site: Site, root: string, revision: string, execute = docker) {
    const main = path.join(root, 'conf.d/default.conf')
    const changes = new Map<string, string>([[main, includeRoutes(readFileSync(main, 'utf8'))],
        [path.join(root, 'snippets/mail-relay-health.conf'), routes(site, revision)],
        [path.join(root, 'conf.d/mail-relay-health-limit.conf'), 'limit_req_zone $binary_remote_addr zone=mail_relay_health:10m rate=2r/s;\n']])
    const previous = new Map([...changes.keys()].map(file => [file, existsSync(file) ? readFileSync(file, 'utf8') : null]))
    const backup = path.join(root, `mail-relay-health-${Date.now()}`)
    mkdirSync(backup)
    for (const [file, content] of previous) if (content !== null) copyFileSync(file, path.join(backup, path.basename(file)))
    try {
        for (const [file, content] of changes) writeFileSync(file, content)
        execute(['exec', 'openresty', 'nginx', '-t'])
        execute(['exec', 'openresty', 'nginx', '-s', 'reload'])
    } catch (error) {
        for (const [file, content] of previous) {
            if (content === null) { if (existsSync(file)) rmSync(file) }
            else writeFileSync(file, content)
        }
        execute(['exec', 'openresty', 'nginx', '-s', 'reload'], true)
        throw error
    }
    return backup
}

if (import.meta.main) {
    const [site, configRoot, revision] = Bun.argv.slice(2)
    if (!site || !configRoot || !revision) throw new Error('Usage: install-health-routes.ts <inspur|ovh> <nginx-config-root> <revision>')
    if (process.env.HANASAND_MAIL_ROUTES_LOCKED !== '1') {
        const child = spawnSync('flock', ['-n', '/tmp/hanasand-frontend-deploy.lock', process.execPath, import.meta.path, site, configRoot, revision],
            { stdio: 'inherit', env: { ...process.env, HANASAND_MAIL_ROUTES_LOCKED: '1' } })
        process.exit(child.status ?? 1)
    }
    const backup = install(site as Site, configRoot, revision)
    console.log(`Relay health routes deployed at ${revision}; rollback files: ${backup}`)
}
