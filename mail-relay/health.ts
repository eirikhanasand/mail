#!/usr/bin/env bun
/** Private relay readiness. Probes never send DATA or create messages. */
import { connect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

export type Checks = Record<string, boolean>
export let STATE: any = { ok: false, checkedAt: null, checks: {} }

class SmtpConnection {
    socket: any
    buffer = ''
    pending: ((response: { code: number; lines: string[] }) => void) | undefined
    constructor(socket: any) {
        this.socket = socket
        socket.setEncoding('utf8')
        socket.on('data', (chunk: string) => { this.buffer += chunk; this.flush() })
        socket.on('error', () => {})
        socket.setTimeout(5000, () => socket.destroy(new Error('SMTP timeout')))
    }
    flush() {
        if (!this.pending) return
        const lines = this.buffer.split(/\r?\n/)
        if (lines.length < 2) return
        const complete: string[] = []
        let end = -1
        for (let i = 0; i < lines.length - 1; i++) {
            complete.push(lines[i])
            if (/^\d{3} /.test(lines[i])) { end = i; break }
            if (!/^\d{3}-/.test(lines[i])) { end = i; break }
        }
        if (end < 0) return
        this.buffer = lines.slice(end + 1).join('\r\n')
        const callback = this.pending; this.pending = undefined
        callback({ code: Number(complete.at(-1)?.slice(0, 3)), lines: complete })
    }
    command(value?: string) {
        if (value) this.socket.write(`${value}\r\n`)
        return new Promise<{ code: number; lines: string[] }>((resolve, reject) => {
            if (this.pending) return reject(new Error('Concurrent SMTP command'))
            const onError = (error: Error) => { this.pending = undefined; reject(error) }
            this.pending = response => { this.socket.removeListener('error', onError); resolve(response) }
            this.socket.once('error', onError)
            this.flush()
        })
    }
    close() { this.socket.destroy() }
    upgrade(serverName: string) {
        this.socket.removeAllListeners('data')
        this.socket.pause()
        this.socket = tlsConnect({ socket: this.socket, servername: serverName, rejectUnauthorized: true })
        this.socket.setEncoding('utf8')
        this.socket.on('data', (chunk: string) => { this.buffer += chunk; this.flush() })
        return new Promise<void>((resolve, reject) => { this.socket.once('secureConnect', resolve); this.socket.once('error', reject) })
    }
}

export async function openSmtp(host: string, port: number, serverName: string) {
    const socket = connect({ host, port, timeout: 5000 })
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject) })
    const smtp = new SmtpConnection(socket)
    const greeting = await smtp.command()
    if (greeting.code !== 220) throw new Error('SMTP greeting unavailable')
    return Object.assign(smtp, { serverName })
}

async function ehlo(smtp: SmtpConnection, name = 'mail.hanasand.com') {
    const result = await smtp.command(`EHLO ${name}`)
    if (result.code !== 250) throw new Error('SMTP EHLO failed')
    return result.lines.join('\n')
}
async function startTls(smtp: SmtpConnection, serverName: string) {
    const result = await smtp.command('STARTTLS')
    if (result.code !== 220) throw new Error('SMTP STARTTLS failed')
    await smtp.upgrade(serverName)
}
async function smtpAuth(smtp: SmtpConnection, settings: any, secureCaps: string) {
    if (/AUTH[^\r\n]*\bPLAIN\b/i.test(secureCaps)) {
        const token = Buffer.from(`\0${settings.username}\0${settings.password}`).toString('base64')
        let result = await smtp.command(`AUTH PLAIN ${token}`)
        if (result.code === 334) result = await smtp.command(token)
        if (result.code !== 235) throw new Error('SMTP authentication failed')
    } else if (/AUTH[^\r\n]*\bLOGIN\b/i.test(secureCaps)) {
        let result = await smtp.command('AUTH LOGIN')
        if (result.code !== 334) throw new Error('SMTP authentication failed')
        result = await smtp.command(Buffer.from(settings.username).toString('base64'))
        if (result.code !== 334) throw new Error('SMTP authentication failed')
        result = await smtp.command(Buffer.from(settings.password).toString('base64'))
        if (result.code !== 235) throw new Error('SMTP authentication failed')
    } else throw new Error('SMTP authentication is not supported')
}

export async function smtpProbe(settings: any, rejectAnonymous = false, factory = openSmtp) {
    const smtp = await factory(settings.host, settings.port, settings.serverName)
    try {
        await ehlo(smtp)
        await startTls(smtp, settings.serverName)
        const secureCaps = await ehlo(smtp)
        if (rejectAnonymous) {
            let result = await smtp.command(`MAIL FROM:<${settings.sender || 'noreply@hanasand.com'}>`)
            if (result.code < 400) result = await smtp.command('RCPT TO:<postmaster@example.net>')
            if (result.code < 400) throw new Error('Anonymous relay accepted')
            await smtp.command('RSET')
        }
        await smtpAuth(smtp, settings, secureCaps)
        const sent = await smtp.command(`MAIL FROM:<${settings.sender || 'noreply@hanasand.com'}>`)
        if (sent.code !== 250) throw new Error('Authenticated relay rejected')
        await smtp.command('RSET')
        return true
    } finally { await smtp.command('QUIT').catch(() => {}); smtp.close() }
}

function epoch(value: unknown) {
    if (typeof value === 'number') return value
    const parsed = Date.parse(String(value).replace(/Z$/, '+00:00'))
    if (!Number.isFinite(parsed)) throw new Error('Invalid queue timestamp')
    return parsed / 1000
}
export async function queueProbe(settings: any, request = fetch, now = () => Date.now() / 1000) {
    const auth = `Basic ${Buffer.from(`${settings.username}:${settings.password}`).toString('base64')}`
    const get = async (endpoint: string) => {
        const response = await request(settings.url + endpoint, { headers: { Authorization: auth }, signal: AbortSignal.timeout(5000) })
        if (!response.ok) throw new Error('Queue unavailable')
        const body = await response.json() as any
        if (body.error || !('data' in body)) throw new Error('Queue unavailable')
        return body.data
    }
    const queue = await get('/api/queue/messages?limit=101')
    if (queue.total > 100) throw new Error('Queue limit exceeded')
    for (const item of queue.items) {
        const message = await get(`/api/queue/messages/${item}`)
        const created = epoch(message.created)
        for (const recipient of message.recipients || [{}]) {
            const status = recipient.status
            if (status && typeof status === 'object' && 'completed' in status) continue
            let due = created
            if (status === 'scheduled' && recipient.retry_num === 0 && recipient.next_retry != null) due = Math.max(created, epoch(recipient.next_retry))
            if (now() - due > 300) throw new Error('Delivery backlog')
        }
    }
    return true
}

export async function incomingProbe(settings: any, factory = openSmtp) {
    const smtp = await factory(settings.host, 25, 'mail.hanasand.com')
    try { await ehlo(smtp); await startTls(smtp, 'mail.hanasand.com'); await ehlo(smtp); return true }
    finally { await smtp.command('QUIT').catch(() => {}); smtp.close() }
}
export function outboundProbe() {
    return new Promise<boolean>((resolve, reject) => {
        const socket = connect({ host: 'hotmail-com.olc.protection.outlook.com', port: 25, timeout: 5000 })
        let buffer = ''
        socket.once('error', reject)
        socket.on('data', (chunk: Buffer) => {
            buffer += chunk.toString()
            if (buffer.includes('\n')) {
                if (!buffer.startsWith('220 ')) { socket.destroy(); reject(new Error('SMTP greeting unavailable')) }
                else { socket.end('QUIT\r\n'); resolve(true) }
            }
        })
    })
}
export function snapshot(service: string, checks: Checks, timestamp = Date.now() / 1000) {
    return { service, ok: Object.keys(checks).length > 0 && Object.values(checks).every(Boolean), checkedAt: new Date(timestamp * 1000).toISOString(), checks }
}
export function publicState(value: any, now = Date.now() / 1000) {
    const result = { ...value }
    const at = result.checkedAt ? Date.parse(result.checkedAt) / 1000 : NaN
    const fresh = Number.isFinite(at) && now - at >= 0 && now - at <= 90
    result.ok = result.ok === true && fresh
    result.summary = result.ok ? 'Mail relay is ready.' : 'Mail relay needs attention.'
    return result
}

export async function poll(config: any, update = (value: any) => { STATE = value }) {
    let tunnel: ReturnType<typeof spawn> | null = null
    const tunnelRunning = () => Boolean(tunnel && tunnel.exitCode === null && tunnel.signalCode === null)
    try {
        while (true) {
            if (config.site === 'inspur' && !tunnelRunning()) {
                tunnel = spawn('ssh', ['-NT', '-i', '/run/ssh/key', '-o', 'UserKnownHostsFile=/run/ssh/known_hosts', '-o', 'StrictHostKeyChecking=yes',
                    '-o', 'IdentitiesOnly=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=5', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
                    '-L', '0.0.0.0:1587:127.0.0.1:2687', '-L', '0.0.0.0:8081:127.0.0.1:19262', '-R', '127.0.0.1:2625:stalwart:25', 'ubuntu@192.99.32.185'], { stdio: 'ignore' })
                tunnel.on('error', () => {})
            }
            const tasks: Record<string, () => Promise<unknown>> = {
                smtpAuthentication: () => smtpProbe(config.smtp, config.site === 'ovh'),
                queueHealthy: () => queueProbe(config.queue),
            }
            if (config.site === 'inspur') tasks.relayAuthentication = () => smtpProbe(config.relay, true)
            else {
                tasks.outboundDeliveryConnection = async () => outboundProbe()
                if (config.incoming) tasks.incomingConnection = () => incomingProbe(config.incoming)
            }
            const checks: Checks = {}
            await Promise.all(Object.entries(tasks).map(async ([key, action]) => { try { checks[key] = await action() === true } catch { checks[key] = false } }))
            if (tunnel) checks.tunnel = tunnelRunning()
            const current = snapshot(`mail-relay-${config.site}`, checks)
            if (JSON.stringify(STATE.checks) !== JSON.stringify(checks)) console.log(JSON.stringify(current))
            update(current)
            await Bun.sleep(30_000)
        }
    } finally { tunnel?.kill('SIGTERM') }
}

if (import.meta.main) {
    const config = JSON.parse(await readFile('/run/config/health.json', 'utf8'))
    void poll(config)
    Bun.serve({ hostname: '0.0.0.0', port: 8080, fetch(request) {
        if (new URL(request.url).pathname !== '/health') return new Response('Not found', { status: 404 })
        const state = publicState(STATE)
        return Response.json(state, { status: state.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
    } })
}
