import { describe, expect, test } from 'bun:test'
import { enforceSenderAuth } from './enforce-sender-auth.ts'

describe('inbound sender authentication policy', () => {
    test('applies and verifies the scoped DMARC policy without changing submission settings', async () => {
        const calls: Array<[string, any]> = []
        let saved: any = { 'auth.dmarc.verify.old': 'keep' }
        const call = async (endpoint: string, body?: any) => {
            calls.push([endpoint, body])
            if (endpoint.startsWith('/settings/keys')) return { data: saved }
            if (endpoint === '/settings') {
                for (const operation of body) {
                    if (operation.type === 'clear') saved = {}
                    if (operation.type === 'insert') saved = Object.fromEntries(operation.values)
                }
            }
            return { data: {} }
        }
        await enforceSenderAuth({ user: 'admin', secret: 'private' }, call)
        expect(saved).toEqual({ 'auth.dmarc.verify.0.if': 'local_port == 25 && is_empty(authenticated_as)',
            'auth.dmarc.verify.0.then': 'strict', 'auth.dmarc.verify.1.else': 'disable' })
        expect(calls.map(([endpoint]) => endpoint)).toEqual([
            '/settings/keys?keys=auth.dmarc.verify&prefixes=auth.dmarc.verify', '/settings', '/reload',
            '/settings/keys?keys=auth.dmarc.verify&prefixes=auth.dmarc.verify',
        ])
    })

    test('restores the prior setting if the new policy fails', async () => {
        const previous = { 'auth.dmarc.verify.0.then': 'disable' }
        const writes: any[] = []
        let current: any = previous
        let failReload = true
        const call = async (endpoint: string, body?: any) => {
            if (endpoint.startsWith('/settings/keys')) return { data: current }
            if (endpoint === '/settings') {
                writes.push(body)
                for (const operation of body) {
                    if (operation.type === 'clear') current = {}
                    if (operation.type === 'insert') current = Object.fromEntries(operation.values)
                }
            }
            if (endpoint === '/reload' && failReload) { failReload = false; throw new Error('reload failed') }
            return { data: {} }
        }
        await expect(enforceSenderAuth({ user: 'admin', secret: 'private' }, call)).rejects.toThrow('reload failed')
        expect(writes).toHaveLength(2)
        expect(current).toEqual(previous)
    })
})
