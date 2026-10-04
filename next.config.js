const nextConfig = {
    output: 'standalone',
    images: { unoptimized: true },
    experimental: { cpus: 2 },
    async headers() {
        return [{
            source: '/:path*',
            headers: [
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
            ],
        }]
    },
}
module.exports = nextConfig
