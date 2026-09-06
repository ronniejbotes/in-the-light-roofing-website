/** Tiny static server for previewing dist/ with the site's URL semantics. */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, process.env.SERVE_DIR || 'dist')
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

  // LiteSpeed's guest-mode script POSTs here on every page load and parses the
  // reply as JSON. Without a valid answer the parse throws, and the exception
  // takes out the rest of that bundle -- which is what leaves nav submenus
  // expanded. Live answers {"reload":"yes"}; a static copy has nothing to
  // reload to, so it declines instead.
  if (url.endsWith('/litespeed-cache/guest.vary.php')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    return res.end('{"reload":"no"}')
  }

  // CallRail's beacon posts visit data to a WordPress REST route. There is no
  // PHP here to receive it, and an unanswered POST logs an error on every page,
  // so acknowledge it and drop it on the floor.
  if (req.url.includes('rest_route=/Calltrk/')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    return res.end('{}')
  }

  let file = join(DIST, url)
  try {
    const s = await stat(file).catch(() => null)
    if (s?.isDirectory() || url.endsWith('/')) file = join(DIST, url, 'index.html')
    if (!existsSync(file) && !extname(file)) file = join(DIST, url, 'index.html')
    const body = await readFile(file)
    // WordPress feeds live at extension-less URLs, so they land in index.html
    // files. Sniff the payload rather than trusting the extension, or a reader
    // asking for /comments/feed/ would be handed text/html.
    let type = TYPES[extname(file)] || 'application/octet-stream'
    if (extname(file) === '.html' && body.subarray(0, 5).toString() === '<?xml') {
      type = body.includes('<rss') || body.includes('<feed')
        ? 'application/rss+xml; charset=utf-8'
        : 'application/xml; charset=utf-8'
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
    res.end(body)
  } catch {
    const nf = join(DIST, '404.html')
    const body = existsSync(nf) ? await readFile(nf) : 'Not found'
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(body)
  }
}).listen(PORT, () => console.log(`Preview: http://127.0.0.1:${PORT}/`))
