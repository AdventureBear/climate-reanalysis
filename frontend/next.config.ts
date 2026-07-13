import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Static export: `next build` emits ./out, served by Render's static site
  // exactly like the previous Vite dist. No Node server in production.
  output: 'export',
  // dir/index.html per route so any static host (Render, python -m http.server)
  // serves /faq and /admin without extensionless-path magic.
  trailingSlash: true,
  reactCompiler: true,
}

export default nextConfig
