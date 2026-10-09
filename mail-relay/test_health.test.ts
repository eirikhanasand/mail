import { describe, expect, test } from 'bun:test'
import { incomingProbe, publicState, queueProbe, snapshot, smtpProbe } from './health.ts'

function fakeSmtp(options: { anonymousAccepted?: boolean; noTls?: boolean } = {}) {
    const commands: string[] = []
    let authenticated = false
    let tls = false
    const smtp = {
        commands,
        async command(line?: string) {
            if (!line) return { code: 220, lines: ['220 ready'] }
            commands.push(line)
            if (line.startsWith('EHLO')) return { code: 250, lines: tls ? ['250-relay', '250-AUTH PLAIN LOGIN', '250 HELP'] : ['250-relay', '250 STARTTLS'] }
            if (line === 'STARTTLS') { if (options.noTls) return { code: 454, lines: ['454 TLS unavailable'] }; tls = true; return { code: 220, lines: ['220 go ahead'] } }
            if (line.startsWith('AUTH PLAIN')) { authenticated = true; return { code: 235, lines: ['235 ok'] } }
            if (line.startsWith('MAIL FROM')) return { code: 250, lines: ['250 ok'] }
            if (line.startsWith('RCPT TO')) return { code: options.anonymousAccepted ? 250 : 550, lines: ['550 denied'] }
            return { code: line === 'QUIT' ? 221 : 250, lines: ['250 ok'] }
        },
        async upgrade() { tls = true },
        close() {},
    }
    return { smtp, commands }
}
const relay = { host: 'mail', port: 587, serverName: 'mail.example.test', username: 'test', password: 'secret', sender: 'sales@hanasand.com' }

describe('mail relay readiness', () => {
    test('stale and failed samples never report ready', () => {
        expect(publicState(snapshot('test', { smtp: true }, 100), 110).ok).toBe(true)
        expect(publicState(snapshot('test', { smtp: true }, 100), 191).ok).toBe(false)
        expect(publicState(snapshot('test', { smtp: false }, 100), 110).ok).toBe(false)
        expect(publicState({ ok: true, checkedAt: null }, 110).ok).toBe(false)
    })

    test('queue probe handles scheduled first attempts, failed recipients, stale queues, and limits', async () => {
        const settings = { url: 'http://mail', username: 'reader', password: 'test' }
        const probe = async (message: any, now: number, total = 1) => {
            let calls = 0
            const request = async () => {
                calls++
                return calls === 1 ? Response.json({ data: { items: [1], total } }) : Response.json({ data: message })
            }
            return queueProbe(settings, request as typeof fetch, () => now)
        }
        const due = Date.parse('2026-09-19T02:10:45Z') / 1000
        const scheduled = { status: 'scheduled', retry_num: 0, next_retry: '2026-09-19T02:10:45Z' }
        const message = { created: '2026-09-19T00:00:00Z', recipients: [scheduled] }
        expect(await probe(message, due - 3600)).toBe(true)
        expect(await probe(message, due + 300)).toBe(true)
        await expect(probe(message, due + 301)).rejects.toThrow('Delivery backlog')
        await expect(probe({ created: 100, recipients: [{ status: { temp_fail: '451' }, retry_num: 1, next_retry: 2000 }] }, 1000)).rejects.toThrow('Delivery backlog')
        await expect(probe(message, due, 101)).rejects.toThrow('Queue limit exceeded')
        await expect(queueProbe(settings, (async () => Response.json({ error: 'forbidden' }, { status: 403 })) as typeof fetch)).rejects.toThrow('Queue unavailable')
    })

    test('submission requires authentication, tests anonymous rejection, and never sends DATA', async () => {
        const { smtp, commands } = fakeSmtp()
        expect(await smtpProbe(relay, true, async () => smtp as any)).toBe(true)
        expect(commands.some(line => line.startsWith('AUTH PLAIN'))).toBe(true)
        expect(commands.some(line => line.startsWith('RCPT TO'))).toBe(true)
        expect(commands.some(line => line === 'DATA')).toBe(false)
        const open = fakeSmtp({ anonymousAccepted: true })
        await expect(smtpProbe(relay, true, async () => open.smtp as any)).rejects.toThrow('Anonymous relay accepted')
        const noTls = fakeSmtp({ noTls: true })
        await expect(incomingProbe({ host: 'mail' }, async () => noTls.smtp as any)).rejects.toThrow('SMTP STARTTLS failed')
        expect(noTls.commands.some(line => line === 'DATA' || line.startsWith('MAIL FROM') || line.startsWith('RCPT TO'))).toBe(false)
    })
})
