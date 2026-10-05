#!/usr/bin/env bun
/** Load the renewed host certificate into Stalwart without exposing its private key. */
import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const defaultState = userInfo().username === 'hanasand' ? '/home/hanasand/hanasand/mail/stalwart'
    : userInfo().username === 'ubuntu' ? '/home/ubuntu/hanasand/mail/stalwart' : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/stalwart')
const mail = process.env.HANASAND_STALWART_STATE_DIR || defaultState
const certDir = process.env.MAIL_TLS_SOURCE || '/home/hanasand/openresty/letsencrypt/live/hanasand.com'
const certPath = path.join(certDir, 'fullchain.pem')
const cert = await readFile(certPath, 'utf8')
let key: string
try { key = await readFile(path.join(certDir, 'privkey.pem'), 'utf8') }
catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EACCES') throw error
    const result = spawnSync('docker', ['exec', 'openresty', 'cat', '/etc/letsencrypt/live/hanasand.com/privkey.pem'], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error('Could not read renewed certificate key from OpenResty')
    key = result.stdout
}
const checked = spawnSync('openssl', ['x509', '-in', certPath, '-noout', '-checkend', '86400'], { stdio: 'ignore' })
if (checked.status !== 0) throw new Error('TLS certificate expires within 24 hours or is invalid')
const state = path.join(homedir(), '.cache/hanasand-mail/tls-certificate-sha256')
await mkdir(path.dirname(state), { recursive: true })
const digest = createHash('sha256').update(cert).digest('hex')
if ((await readFile(state, 'utf8').catch(() => '')).trim() === digest) process.exit(0)
const toml = await readFile(path.join(mail, 'etc/config.toml'), 'utf8')
const section = toml.match(/^\[authentication\.fallback-admin\]\s*\n([\s\S]*?)(?=^\[|\s*$)/m)?.[1]
function tomlString(key: string) {
    const value = section?.match(new RegExp(`^${key}\\s*=\\s*("(?:\\\\.|[^"\\\\])*"|'[^']*')\\s*$`, 'm'))?.[1]
    if (!value) throw new Error(`Missing fallback-admin ${key} in Stalwart configuration`)
    return value.startsWith('"') ? JSON.parse(value) : value.slice(1, -1)
}
const admin = { user: tomlString('user'), secret: tomlString('secret') }
const base = ['exec', 'hanasand_mail', 'stalwart-cli', '-u', 'http://127.0.0.1:8080', '-c', `${admin.user}:${admin.secret}`, 'server']
for (const [field, value] of [['cert', cert], ['private-key', key], ['default', 'true']]) {
    const result = spawnSync('docker', [...base, 'add-config', `certificate.default.${field}`, '--', value], { stdio: 'ignore' })
    if (result.status !== 0) throw new Error(`Stalwart certificate update failed for ${field}; certificate state was not marked current.`)
}
for (const action of ['reload-config', 'reload-certificates']) {
    if (spawnSync('docker', [...base, action], { stdio: 'ignore' }).status !== 0)
        throw new Error(`Stalwart ${action} failed; certificate state was not marked current.`)
}
await writeFile(state, `${digest}\n`, { mode: 0o600 })
await chmod(state, 0o600)
console.log('Stalwart TLS certificate updated.')
