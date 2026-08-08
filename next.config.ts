import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @react-pdf/renderer is Node-only and must not be bundled into server chunks.
  serverExternalPackages: ['@react-pdf/renderer'],
  async headers() {
    return [
      {
        // Client invoices must never be indexed by search engines.
        source: '/i/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default nextConfig
