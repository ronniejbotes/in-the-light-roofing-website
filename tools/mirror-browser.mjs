/**
 * Browser-driven mirror.
 *
 * The plain HTTP mirror (mirror.mjs) is fast, but this site is behind
 * LiteSpeed, which serves different bytes at the same URL depending on a cookie
 * it sets from JavaScript after the first paint. No HTTP client reproduces that
 * reliably, so this walks the site in a real browser, in one context so the
 * cookie persists exactly as it does for a visitor, and writes whatever the
 * browser actually received.
 *
 * Usage:
 *   node tools/mirror-browser.mjs                       # every route in shots/all-routes.txt
 *   node tools/mirror-browser.mjs / /contact/           # specific routes
 *   MIRROR_DIR=mirror2 node tools/mirror-browser.mjs
 */
import { chromium } from 'playwright-core'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, process.env.MIRROR_DIR || 'mirror')
const ORIGIN = 'https://inthelightroofing.com'
const EXEC = process.env.CHROME || join(process.env.USERPROFILE || process.env.HOME || '',
  'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const TABS = Number(process.env.TABS || 4)

const ALIAS_HOSTS = [
  'inthelightroofing.zb167wadjd-ez94dq1rz3mr.p.temp-site.link',
  'www.inthelightroofing.com',
]

const KEEP_ABSOLUTE = [
  /<link[^>]+rel=["'](?:canonical|alternate|shortlink)["'][^>]*>/gi,
  /<meta[^>]+(?:property|name)=["'](?:og:[a-z:_]+|twitter:[a-z:_]+)["'][^>]*>/gi,
  /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
]

/** Same-origin absolute URLs -> root-relative; identity metadata left alone. */
function rewrite(text, protectMeta) {
  const vault = []
  let out = text
  if (protectMeta) {
    for (const re of KEEP_ABSOLUTE) {
      out = out.replace(re, (m) => { vault.push(m); return ` MIRROR_KEEP_${vault.length - 1} ` })
    }
  }
  for (const host of [ORIGIN, ...ALIAS_HOSTS.map((h) => `https://${h}`), 'http://inthelightroofing.com']) {
    out = out.split(host).join('')
  }
  out = out.split(ORIGIN.replace(/\//g, '\\/')).join('')
  return out.replace(/ MIRROR_KEEP_(\d+) /g, (_, i) => vault[Number(i)])
}

// A real page on this site is a full WordPress render: hundreds of KB with a
// head and a body. Anything far smaller, or carrying a server error title, is
// the site failing under load rather than a page worth mirroring.
const ERROR_MARKERS = [
  'Database Error',
  'Error establishing a database connection',
  'Service Temporarily Unavailable',
  '503 Service',
  'Too Many Requests',
  'Bad Gateway',
]
const MIN_PAGE_BYTES = Number(process.env.MIN_PAGE_BYTES || 20000)

function describeBadPage(html) {
  for (const m of ERROR_MARKERS) if (html.includes(m)) return `server error page (${m})`
  if (html.length < MIN_PAGE_BYTES) return `only ${html.length} bytes`
  return 'unrecognised'
}
function isPlausiblePage(html) {
  if (!html || html.length < MIN_PAGE_BYTES) return false
  for (const m of ERROR_MARKERS) if (html.includes(m)) return false
  return /<body/i.test(html)
}

function pathToFile(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0].split('#')[0])
  if (p.endsWith('/') || p === '') return join(OUT, p, 'index.html')
  return extname(p) ? join(OUT, p) : join(OUT, p, 'index.html')
}

const routes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (await readFile(join(ROOT, 'shots/all-routes.txt'), 'utf8'))
      .split('\n').map((s) => s.trim()).filter(Boolean)

const stats = { pages: 0, assets: 0, skipped: 0, failed: [] }
const written = new Set()

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: EXEC })
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * Every page is captured in a fresh context, i.e. as a first-time visit with no
 * LiteSpeed cookie yet. That is what a visitor arriving from search gets, and
 * it is the state the live site is measured in. Reusing one context would let
 * the cookie carry over and hand us the non-guest build from page two onward,
 * which renders differently.
 */
async function withContext(fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA })
  try { return await fn(ctx) } finally { await ctx.close() }
}

/** Persist one response if it belongs to this site and we have not stored it. */
async function store(res) {
  const url = res.url()
  if (!url.startsWith(ORIGIN)) return
  if (res.status() !== 200) return
  const urlPath = url.slice(ORIGIN.length) || '/'
  const bare = urlPath.split('?')[0]
  if (/\.php(\?|$)/.test(bare)) return
  const file = pathToFile(urlPath)
  if (written.has(file)) return

  let buf
  try { buf = await res.body() } catch { return }   // body already discarded
  written.add(file)
  await mkdir(dirname(file), { recursive: true })

  const ext = extname(bare)
  if (ext === '.css') {
    await writeFile(file, rewrite(buf.toString('utf8'), false))
  } else if (ext === '.js') {
    await writeFile(file, rewrite(buf.toString('utf8'), false))
  } else {
    await writeFile(file, buf)
  }
  stats.assets++
}

async function visit(route) {
  return withContext(async (ctx) => {
  const page = await ctx.newPage()
  // Response bodies must be read before the context closes, so keep hold of
  // every store() promise and settle them below. Fire-and-forget here silently
  // loses any asset whose body is still being read when the page goes away.
  const pending = []
  page.on('response', (r) => { pending.push(store(r).catch(() => {})) })
  try {
    const res = await page.goto(ORIGIN + route, { waitUntil: 'load', timeout: 60000 })
    // Scroll so lazy images and any deferred CSS actually get requested.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 800) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30))
      }
      window.scrollTo(0, 0)
    }).catch(() => {})
    await page.waitForTimeout(1500)

    // Save the document from the server, not the mutated DOM, so the mirrored
    // markup still boots its own scripts the way the original does.
    const html = await res.text()

    // Under load WordPress answers with a "Database Error" page, still at HTTP
    // 200. Writing that would bake a broken page into the mirror and look like
    // a successful capture, so refuse it and let the route be retried.
    if (!isPlausiblePage(html)) {
      stats.failed.push(`${route} — rejected: ${describeBadPage(html)}`)
      await Promise.allSettled(pending)
      await page.close()
      return
    }

    const file = pathToFile(route)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, rewrite(html, true))
    stats.pages++
  } catch (e) {
    stats.failed.push(`${route} — ${e.message.split('\n')[0]}`)
  }
  await Promise.allSettled(pending)
  await page.close()
  if (stats.pages % 20 === 0) console.log(`  …${stats.pages}/${routes.length} pages, ${stats.assets} assets`)
  })
}

console.log(`Browser-mirroring ${routes.length} routes into ${OUT}`)
let i = 0
await Promise.all(Array.from({ length: TABS }, async () => {
  while (i < routes.length) await visit(routes[i++])
}))

/**
 * Nothing on a page links to the sitemaps, robots.txt or the feeds, so a
 * browser never requests them and they would be missing from the mirror.
 * Crawlers do ask for them, so fetch them directly.
 */
const recordedRedirects = []

async function fetchDirect(urlPath) {
  try {
    // Do not follow: some of these URLs are redirects on the live site
    // (/feed/ 301s to the homepage). Following one would save a copy of the
    // target under the source's path instead of reproducing the redirect.
    const res = await fetch(ORIGIN + urlPath, {
      headers: { 'User-Agent': UA }, redirect: 'manual',
    })
    if (res.status >= 300 && res.status < 400) {
      const to = (res.headers.get('location') || '').replace(ORIGIN, '') || '/'
      recordedRedirects.push(`${urlPath}  ${to}  ${res.status}`)
      return null
    }
    if (!res.ok) return `${res.status} ${urlPath}`
    const body = Buffer.from(await res.arrayBuffer())
    const file = pathToFile(urlPath)
    await mkdir(dirname(file), { recursive: true })
    const isText = /\.(xml|txt)$/.test(urlPath) || !extname(urlPath)
    await writeFile(file, isText ? rewrite(body.toString('utf8'), true) : body)
    stats.assets++
    return null
  } catch (e) { return `${urlPath} — ${e.message}` }
}

const orphans = ['/robots.txt', '/sitemap_index.xml', '/post-sitemap.xml', '/page-sitemap.xml',
  '/testimonial-sitemap.xml', '/category-sitemap.xml', '/feed/', '/comments/feed/']
console.log(`\nFetching ${orphans.length} files no page links to (sitemaps, robots, feeds)…`)
for (const o of orphans) {
  const err = await fetchDirect(o)
  if (err) stats.failed.push(`orphan ${err}`)
}

// serve.mjs replays this file, so a redirect on the live site stays a redirect
// here rather than becoming a duplicate page under the wrong URL.
if (recordedRedirects.length) {
  const header = '# Redirects observed on the live site, replayed by build/serve.mjs\n'
  await writeFile(join(OUT, '_redirects'), header + recordedRedirects.join('\n') + '\n')
  console.log(`recorded ${recordedRedirects.length} redirect(s) to _redirects`)
  for (const r of recordedRedirects) console.log(`   ${r}`)
}

await browser.close()
console.log('\n--- browser mirror complete ---')
console.log(`pages:   ${stats.pages}`)
console.log(`assets:  ${stats.assets}`)
console.log(`failed:  ${stats.failed.length}`)
for (const f of stats.failed.slice(0, 20)) console.log(`  ! ${f}`)
