import fs from 'node:fs/promises'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig, type Plugin } from 'vite'

function createSelfReferentialSourceMap(fileName: string, fileContents: string) {
  const lineCount = Math.max(1, fileContents.split(/\r?\n/).length)

  return {
    version: 3,
    file: fileName,
    sources: [fileName],
    sourcesContent: [fileContents],
    names: [],
    mappings: Array.from({ length: lineCount }, (_, index) => (index === 0 ? 'AAAA' : 'AACA')).join(';'),
  }
}

function fixEmptyOptimizedDepSourceMaps(): Plugin {
  return {
    name: 'fix-empty-optimized-dep-source-maps',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void (async () => {
          const requestPath = req.url?.split('?')[0]
          if (!requestPath?.startsWith('/node_modules/.vite/deps/') || !requestPath.endsWith('.js.map')) {
            next()
            return
          }

          try {
            const mapFilePath = path.resolve(__dirname, `.${decodeURIComponent(requestPath)}`)
            const rawMap = await fs.readFile(mapFilePath, 'utf8')
            const parsedMap = JSON.parse(rawMap) as { sources?: string[] }

            if ((parsedMap.sources?.length ?? 0) > 0) {
              next()
              return
            }

            const sourceFilePath = mapFilePath.slice(0, -4)
            const sourceFileName = path.basename(sourceFilePath)
            const sourceFileContents = await fs.readFile(sourceFilePath, 'utf8')
            const syntheticMap = createSelfReferentialSourceMap(sourceFileName, sourceFileContents)

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(syntheticMap))
          } catch {
            next()
          }
        })()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), fixEmptyOptimizedDepSourceMaps()],
  envDir: '../',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
