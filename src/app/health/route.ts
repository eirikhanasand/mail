export function GET() {
    return Response.json({ ok: true, service: 'hanasand-mail' }, { headers: { 'cache-control': 'no-store' } })
}
