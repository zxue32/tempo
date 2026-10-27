import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['postgres'],
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
}

export default nextConfig
