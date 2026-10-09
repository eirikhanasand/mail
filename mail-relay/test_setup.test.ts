import { describe, expect, test } from 'bun:test'
import { COMPOSE_FILE, composeCommand, hasApiErrors, mailAdmin, parseAdmin, parseLastJsonLine, prepareLegacyContainer } from './setup.ts'

const config = '[authentication.fallback-admin]\nuser = "relay-admin"\nsecret = "test-secret"\n'
const current = (source = '/new/health', image = 'health:old') => ({ Config: { Image: image, Labels: {} }, Mounts: [{ Source: source, Destination: '/run/config' }],
    NetworkSettings: { Networks: { hanasand_hanasandnet: { IPAddress: '172.20.0.9' } } } })

describe('mail relay setup', () => {
    test('reads fallback admin credentials from Stalwart TOML, including private-container fallback', () => {
        expect(parseAdmin(config)).toEqual({ user: 'relay-admin', secret: 'test-secret' })
        expect(parseAdmin('authentication.fallback-admin.secret = "dotted-secret"\nauthentication.fallback-admin.user = "dotted-admin"\n')).toEqual({ user: 'dotted-admin', secret: 'dotted-secret' })
        const readContainer = () => config
        expect(mailAdmin('/private/config.toml', () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }) }, readContainer)).toEqual({ user: 'relay-admin', secret: 'test-secret' })
        expect(() => parseAdmin('[authentication]\nuser = "missing"')).toThrow('fallback-admin')
    })

    test('uses the dedicated Compose project and host profile', () => {
        expect(composeCommand('inspur', ['up', '-d', '--build', 'relay-health-inspur'])).toEqual([
            'docker', 'compose', '--project-name', 'hanasand-mail-relay-inspur', '--file', COMPOSE_FILE,
            '--profile', 'relay-inspur', 'up', '-d', '--build', 'relay-health-inspur',
        ])
    })

    test('reads API sender settings after runtime startup output', () => {
        expect(parseLastJsonLine('◇ bun v1.3.13\n{"user":"mailer"}\n')).toEqual({ user: 'mailer' })
        expect(() => parseLastJsonLine('◇ bun v1.3.13')).toThrow('did not return JSON')
    })

    test('treats empty Stalwart reload error collections as success', () => {
        expect(hasApiErrors({ data: { errors: {} } })).toBe(false)
        expect(hasApiErrors({ data: { errors: [] } })).toBe(false)
        expect(hasApiErrors({ data: { errors: { 'server.listener': 'invalid' } } })).toBe(true)
    })

    test('removes a matching legacy container before Compose adopts its stable name', () => {
        const calls: string[][] = []
        const ip = prepareLegacyContainer('hanasand-mail-relay-inspur', ['/new/health:/run/config:ro'], undefined, {
            exists: () => true, inspect: () => current(), run: (args: string[]) => calls.push(args),
        })
        expect(ip).toBe('172.20.0.9')
        expect(calls).toEqual([
            ['docker', 'stop', '-t', '15', 'hanasand-mail-relay-inspur'],
            ['docker', 'rm', 'hanasand-mail-relay-inspur'],
        ])
    })

    test('rejects containers whose persistent mounts do not match the relay state', () => {
        const calls: string[][] = []
        expect(() => prepareLegacyContainer('hanasand-mail-relay-inspur', ['/expected/health:/run/config:ro'], undefined, {
            exists: () => true, inspect: () => current('/unexpected/health'), run: (args: string[]) => calls.push(args),
        })).toThrow('unexpected persistent mounts')
        expect(calls).toEqual([])
    })

    test('leaves containers already owned by the dedicated Compose project in place', () => {
        const calls: string[][] = []
        expect(prepareLegacyContainer('hanasand-mail-relay-inspur', ['/new/health:/run/config:ro'], undefined, {
            exists: () => true,
            inspect: () => ({ ...current(), Config: { Image: 'health:current', Labels: { 'com.docker.compose.project': 'hanasand-mail-relay-inspur' } } }),
            run: (args: string[]) => calls.push(args),
        })).toBe('172.20.0.9')
        expect(calls).toEqual([])
    })
})
