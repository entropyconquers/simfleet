import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMDX } from 'fumadocs-mdx/next'

// Static export for GitHub Pages. DOCS_BASE_PATH is "/simfleet" in CI and empty locally.
const basePath = process.env.DOCS_BASE_PATH || ''

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The repository root has its own bun.lock; build from this directory.
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
  output: 'export',
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

const withMDX = createMDX()

export default withMDX(nextConfig)
