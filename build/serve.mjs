/** Tiny static server for previewing dist/ with the site's URL semantics. */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 4321)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
}

// Parse _redirects so the preview behaves like the deployed host.
const redirects = []
const rf = join(DIST, '_redirects')
if (existsSync(rf)) {
  for (const line of (await readFile(rf, 'utf8')).split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const [from, to, code] = t.split(/\s+/)
    if (from && to) redirects.push({ from, to, code: Number(code) || 301 })
  }
}

createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])

  const hit = redirects.find((r) =>
    r.from.endsWith('/*') ? url.startsWith(r.from.slice(0, -1)) : r.from === url
  )
  if (hit) {
    res.writeHead(hit.code, { Location: hit.to })
    return res.end()
  }

  let file = join(DIST, url)
  try {
    const s = await stat(file).catch(() => null)
    if (s?.isDirectory() || url.endsWith('/')) file = join(DIST, url, 'index.html')
    if (!existsSync(file) && !extname(file)) file = join(DIST, url, 'index.html')
    const body = await readFile(file)
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    res.end(body)
  } catch {
    const nf = join(DIST, '404.html')
    const body = existsSync(nf) ? await readFile(nf) : 'Not found'
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(body)
  }
}).listen(PORT, () => console.log(`Preview: http://127.0.0.1:${PORT}/`))
