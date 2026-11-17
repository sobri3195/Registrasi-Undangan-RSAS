import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const buildId = (() => {
  try {
    const value =
      process.env.VERCEL_GIT_COMMIT_SHA ||
      execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        encoding: 'utf8',
      }).trim()
    return /^[a-f0-9]{7,40}$/i.test(value) ? value.slice(0, 7) : 'local'
  } catch {
    return 'local'
  }
})()

export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify(buildId) },
  plugins: [
    react(),
    {
      name: 'static-offline-assets',
      closeBundle() {
        const assets = readdirSync('dist/assets').map(
          (name) => `/assets/${name}`,
        )
        const shell = readFileSync('dist/index.html', 'utf8')
        const template = readFileSync('public/sw.js', 'utf8')
        const digest = createHash('sha256').update(shell).update(template)
        for (const asset of [...assets, '/icon.svg', '/manifest.webmanifest'])
          digest.update(readFileSync(`dist${asset}`))
        const version = digest.digest('hex').slice(0, 12)
        writeFileSync(
          'dist/sw.js',
          template
            .replace('__CACHE_VERSION__', version)
            .replace(
              '/* __ASSETS__ */ []',
              JSON.stringify([
                '/index.html',
                '/icon.svg',
                '/manifest.webmanifest',
                ...assets,
              ]),
            ),
        )
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          decoder: ['jsqr'],
          supabase: ['@supabase/supabase-js'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
