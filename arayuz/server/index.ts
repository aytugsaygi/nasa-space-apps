import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handle } from './api'

/*
 * Yayın sunucusu: derlenmiş arayüzü (dist/) ve API'yi aynı adresten sunar.
 *   npm run build && npm run build:server && npm start
 * Port PORT ortam değişkeniyle değişir (varsayılan 8787).
 */

const here = dirname(fileURLToPath(import.meta.url))
const DIST = join(here, '..', 'dist')
const PORT = Number(process.env.PORT ?? 8787)

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
}

createServer(async (req, res) => {
  if (await handle(req, res)) return
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^([/\\])+/, '')
  let file = join(DIST, path)
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
  createReadStream(file).pipe(res)
}).listen(PORT, () => console.log(`Vitalis: http://localhost:${PORT}`))
