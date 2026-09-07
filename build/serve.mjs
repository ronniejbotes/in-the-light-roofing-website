/** Tiny static server for previewing dist/ with the site's URL semantics. */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, resolve, dirname, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(join(ROOT, process.env.SERVE_DIR || 'dist'))
const PORT = Number(process.env.PORT || 4321)
// Loopback by default. Node binds every interface when no host is given, which
// put this preview -- and, before the check below, every file the traversal
// could reach -- on the local network.
const HOST = process.env.HOST || '127.0.0.1'

/**
 * Resolve a request path inside DIST, or null if it escapes.
 *
 * The URL is percent-decoded before it is joined, so "/%2e%2e/package.json"
 * arrives here as "/../package.json" and join() happily normalises its way out
 * of the served directory. Confining the resolved path is the only reliable
 * check: stripping ".." from the raw string misses encoded and doubled forms.
 */
function within(urlPath) {
  const p = resolve(join(DIST, urlPath))
  const rel = relative(DIST, p)
  if (rel !== '' && (rel.startsWith('..') || isAbsolute(rel))) return null
  return p
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
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
  // A malformed escape ("/%zz") makes decodeURIComponent throw. Unhandled, the
  // request is answered with a dropped connection rather than a status, which is
  // indistinguishable from the server being down. Answer 400 and carry on.
  let url
  try {
    url = decodeURIComponent(req.url.split('?')[0])
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('Bad request')
  }

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

  // Fixes layered over the mirrored markup. They live outside mirror/ so the
  // clone stays byte-faithful; see overrides/ for what they do and how to move
  // them to WordPress.
  const OVERRIDE_FILES = {
    '/_overrides.css': 'overrides.css',
    '/_overrides.js': 'overrides.js',
    '/_reviews.css': 'reviews.css',
    '/_reviews.js': 'reviews.js',
    '/_process.css': 'process.css',
    '/_process.js': 'process.js',
    '/_team.css': 'team.css',
    '/_team.js': 'team.js',
    '/_careers.css': 'careers.css',
    '/_careers.js': 'careers.js',
    '/_links.css': 'links.css',
    '/_mobile.css': 'mobile.css',
  }
  // OVERRIDES=off means "serve exactly what is in the directory". Previewing
  // publish/ that way, this shortcut used to hand back the source override
  // files while the pages around them were the decluttered copies -- so a rule
  // written against `wp-image-5320` never matched the `ui-image-5320` in the
  // baked markup, and the preview showed a broken service grid the real deploy
  // would not have had. The baked files win when they are what is being served.
  if (OVERRIDE_FILES[url] && process.env.OVERRIDES !== 'off') {
    const f = join(ROOT, 'overrides', OVERRIDE_FILES[url])
    if (existsSync(f)) {
      res.writeHead(200, {
        'Content-Type': url.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      return res.end(await readFile(f))
    }
  }

  // Images the overrides bring with them. Same reasoning as the files above:
  // they are not part of the captured site, so they live outside mirror/.
  // Confined to overrides/assets the same way the mirror is confined -- the URL
  // is already percent-decoded here, so a "/_assets/..%2f..%2fpackage.json"
  // arrives as plain "..", and only resolving and comparing catches it.
  if (url.startsWith('/_assets/') && process.env.OVERRIDES !== 'off') {
    const dir = resolve(join(ROOT, 'overrides', 'assets'))
    const p = resolve(join(dir, url.slice('/_assets/'.length)))
    const rel = relative(dir, p)
    if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && existsSync(p)) {
      res.writeHead(200, {
        'Content-Type': TYPES[extname(p)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      return res.end(await readFile(p))
    }
  }

  let file = within(url)
  try {
    if (!file) throw new Error('outside the served directory')
    const s = await stat(file).catch(() => null)
    if (s?.isDirectory() || url.endsWith('/')) file = within(join(url, 'index.html'))
    if (file && !existsSync(file) && !extname(file)) file = within(join(url, 'index.html'))
    if (!file) throw new Error('outside the served directory')
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
    // Inject the overrides into HTML documents only -- not the RSS feed that
    // also lives in an index.html, and not when OVERRIDES=off, which is how you
    // view the mirror exactly as captured.
    let out = body
    if (type.startsWith('text/html') && process.env.OVERRIDES !== 'off') {
      const tags = '<link rel="stylesheet" href="/_overrides.css">'
        + '<link rel="stylesheet" href="/_reviews.css">'
        + '<link rel="stylesheet" href="/_process.css">'
        + '<link rel="stylesheet" href="/_team.css">'
        + '<link rel="stylesheet" href="/_careers.css">'
        + '<link rel="stylesheet" href="/_links.css">'
        + '<link rel="stylesheet" href="/_mobile.css">'
        + '<script src="/_overrides.js" defer></script>'
        + '<script src="/_reviews.js" defer></script>'
        + '<script src="/_process.js" defer></script>'
        + '<script src="/_team.js" defer></script>'
        + '<script src="/_careers.js" defer></script>'
      const html = body.toString('utf8')
      const i = html.lastIndexOf('</head>')
      out = Buffer.from(i === -1 ? html + tags : html.slice(0, i) + tags + html.slice(i), 'utf8')
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
    res.end(out)
  } catch {
    const nf = join(DIST, '404.html')
    const body = existsSync(nf) ? await readFile(nf) : 'Not found'
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(body)
  }
}).listen(PORT, HOST, () => console.log(`Preview: http://${HOST}:${PORT}/`))
