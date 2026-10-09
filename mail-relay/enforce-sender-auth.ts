#!/usr/bin/env bun
/** Enforce published DMARC reject policies on inbound SMTP; preserve authenticated submission. */
import { api, mailAdmin } from './setup.ts'
import { isDeepStrictEqual } from 'node:util'

export async function enforceSenderAuth(admin = mailAdmin(), call = (endpoint: string, body?: unknown) =>
    api('http://127.0.0.1:8081', admin.user, admin.secret, endpoint, body)) {
    const prefix = 'auth.dmarc.verify'
    const old = (await call(`/settings/keys?keys=${prefix}&prefixes=${prefix}`)).data
    const values = {
        [`${prefix}.0.if`]: 'local_port == 25 && is_empty(authenticated_as)',
        [`${prefix}.0.then`]: 'strict',
        [`${prefix}.1.else`]: 'disable',
    }
    const save = async (settings: Record<string, string>) => {
        await call('/settings', [{ type: 'clear', prefix }, { type: 'insert', assert_empty: false, prefix: null, values: Object.entries(settings) }])
        await call('/reload')
    }
    try {
        await save(values)
        if (!isDeepStrictEqual((await call(`/settings/keys?keys=${prefix}&prefixes=${prefix}`)).data, values))
            throw new Error('Sender authentication settings did not persist.')
    } catch (error) {
        await save(old)
        throw error
    }
    console.log('Incoming SMTP enforces DMARC rejection; authenticated submission is unchanged.')
}

if (import.meta.main) await enforceSenderAuth()
