import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, test } from 'bun:test'
import { INCLUDE, includeRoutes, install, routes, SITES } from './install-health-routes.ts'

const REVISION = 'a'.repeat(40)
const SOURCE = `server {
    listen 443 ssl;
    server_name hanasand.com;
    location / { proxy_pass http://website; }
}

server {
    listen 443 ssl;
    server_name api.hanasand.com;
    location / { proxy_pass http://application; }
}
`

describe('mail relay health routes', () => {
    test('routes local health directly and verifies the fixed remote gateway', () => {
        for (const [site, peer] of [['inspur', 'ovh'], ['ovh', 'inspur']] as const) {
            const config = routes(site, REVISION)
            expect(config).toContain(`proxy_pass http://127.0.0.1:${SITES[site][1]}/health;`)
            expect(config).toContain(`proxy_pass https://${SITES[peer][0]}/api/mail-relay/${peer}/health;`)
            expect(config).toContain('proxy_ssl_verify on;')
            expect(config).toContain('proxy_ssl_name api.hanasand.com;')
            expect(config).not.toContain('hanasand_recovery_api')
            expect(config.match(/limit_except GET \{ deny all; \}/g)).toHaveLength(2)
            expect(config.match(/proxy_method GET;/g)).toHaveLength(2)
            expect(config.match(/proxy_pass_request_headers off;/g)).toHaveLength(2)
            expect(config.match(/proxy_intercept_errors off;/g)).toHaveLength(2)
            expect(config).toContain('limit_req_status 429;')
            expect(config).toContain('error_page 502 504 =503')
            expect(config).toContain('"ok":false')
            expect(config).toContain('Cache-Control "no-store" always;')
        }
    })

    test('changes only the API TLS host and remains idempotent', () => {
        const updated = includeRoutes(SOURCE)
        expect(includeRoutes(updated)).toBe(updated)
        expect(updated.match(new RegExp(INCLUDE, 'g'))).toHaveLength(1)
        expect(updated.split('server_name api.hanasand.com;')[0]).toBe(SOURCE.split('server_name api.hanasand.com;')[0])
        expect(updated).toContain('location / { proxy_pass http://application; }')
        expect(() => includeRoutes(SOURCE.replace('api.hanasand.com', 'other.example'))).toThrow('Expected exactly one')
        expect(() => includeRoutes(SOURCE + SOURCE)).toThrow('Expected exactly one')
        expect(() => routes('ovh' as any, 'not-a-revision')).toThrow('full pushed revision')
    })

    test('failed nginx validation restores every prior file', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'mail-health-routes-'))
        try {
            mkdirSync(path.join(root, 'conf.d')); mkdirSync(path.join(root, 'snippets'))
            const main = path.join(root, 'conf.d/default.conf')
            writeFileSync(main, SOURCE)
            const snippet = path.join(root, 'snippets/mail-relay-health.conf')
            writeFileSync(snippet, 'previous configuration')
            const calls: string[][] = []
            const execute = (args: string[]) => { calls.push(args); if (args.at(-1) === '-t') throw new Error('nginx validation failed') }
            expect(() => install('ovh', root, REVISION, execute as any)).toThrow('nginx validation failed')
            expect(readFileSync(main, 'utf8')).toBe(SOURCE)
            expect(readFileSync(snippet, 'utf8')).toBe('previous configuration')
            expect(existsSync(path.join(root, 'conf.d/mail-relay-health-limit.conf'))).toBe(false)
            expect(calls).toHaveLength(2)
        } finally { rmSync(root, { recursive: true, force: true }) }
    })
})
