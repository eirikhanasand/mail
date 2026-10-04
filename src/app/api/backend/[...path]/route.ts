import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

type Context = { params: Promise<{ path?: string[] }> }
const API_BASE = (process.env.HANASAND_API_BASE || 'https://api.hanasand.com/api').replace(/\/+$/, '')
const HOP_HEADERS = new Set(['connection', 'content-encoding', 'content-length', 'host', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])

async function handler(req: NextRequest, context: Context) {
    const { path = [] } = await context.params
    if (path[0] !== 'mail' || path.length < 2 || path.some(part => part === '.' || part === '..')) {
        return NextResponse.json({ error: 'Not found.' }, { status: 404, headers: { 'cache-control': 'no-store' } })
    }

    const jar = await cookies()
    const token = jar.get('access_token')?.value || ''
    const id = jar.get('id')?.value || ''
    if (!token || !id) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: { 'cache-control': 'no-store' } })

    const target = new URL(`${API_BASE}/${path.map(encodeURIComponent).join('/')}`)
    target.search = req.nextUrl.search
    const headers = new Headers()
    req.headers.forEach((value, key) => {
        if (!HOP_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== 'cookie' && key.toLowerCase() !== 'authorization' && key.toLowerCase() !== 'id') headers.set(key, value)
    })
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('id', id)

    try {
        const response = await fetch(target, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
            cache: 'no-store',
            signal: AbortSignal.timeout(15_000),
            ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { duplex: 'half' as const }),
        } as RequestInit & { duplex?: 'half' })
        const responseHeaders = new Headers()
        response.headers.forEach((value, key) => {
            if (!HOP_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== 'set-cookie') responseHeaders.set(key, value)
        })
        responseHeaders.set('cache-control', 'no-store')
        const result = new NextResponse(response.body, { status: response.status, headers: responseHeaders })
        const refreshedToken = response.headers.get('x-access-token')
        const expires = response.headers.get('x-access-token-expires-at')
        if (refreshedToken) result.cookies.set('access_token', refreshedToken, { domain: '.hanasand.com', path: '/', secure: true, sameSite: 'lax', expires: expires ? new Date(expires) : undefined })
        return result
    } catch {
        return NextResponse.json({ error: 'Mail service is temporarily unavailable.' }, { status: 503, headers: { 'cache-control': 'no-store' } })
    }
}

export const GET = handler
export const HEAD = handler
export const POST = handler
export const DELETE = handler
