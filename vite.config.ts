import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

export default defineConfig({
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
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
