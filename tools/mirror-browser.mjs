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
 *   node tools/mirror-browser.mjs                       # every route in routes.txt
 *   ROUTES_FILE=other.txt node tools/mirror-browser.mjs  # a different manifest
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
  const hosts = [ORIGIN, ...ALIAS_HOSTS.map((h) => `https://${h}`), 'http://inthelightroofing.com']

  // A bare origin -- the host with no path after it -- is a link to the homepage.
  // Stripping it outright leaves href="", which a browser resolves to the current
  // document, so the "Home" breadcrumb on 178 pages pointed at the page it was
  // already on. The with-path form is parked under a sentinel first so that only
  // the bare form is left to become '/'.
  const MARK = 'MIRROR_ORIGIN_MARK'
  for (const host of hosts) {
    out = out.split(host + '/').join(MARK)
    out = out.split(host).join('/')
    out = out.split(MARK).join('/')
  }

  // The same origin appears slash-escaped inside JSON payloads.
  const esc = ORIGIN.replace(/\//g, '\\/')
  out = out.split(esc + '\\/').join(MARK)
  out = out.split(esc).join('\\/')
  out = out.split(MARK).join('\\/')
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

/**
 * routes.txt is the tracked manifest of every URL the mirror must contain. It is
 * tracked because shots/all-routes.txt and .routes.json are both gitignored, so a
 * fresh clone had no definition of "the whole site" -- which is how the 127 /tag/
 * archives stayed off the capture list without anything noticing. Lines starting
 * with # are comments.
 */
async function routeManifest() {
  const file = process.env.ROUTES_FILE || 'routes.txt'
  const text = await readFile(join(ROOT, file), 'utf8')
  return text.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
}

const routes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : await routeManifest()

// Routes on the command line mean "capture just these". The orphan files and
// _redirects describe the whole site, not the routes being captured, and both
// are written by replacing what is there. Doing that from a subset would swap a
// verified 19-line redirect list for the one redirect this run happened to see.
// So they are full-run only.
const FULL_RUN = process.argv.slice(2).length === 0

const stats = { pages: 0, assets: 0, skipped: 0, failed: [] }
const written = new Set()

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: EXEC })
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * ONE context for the whole run, primed with LiteSpeed's _lscache_vary cookie.
 *
 * Guest mode serves two different documents. Without the cookie you get a
 * placeholder: 50 script tags but only ONE with src, twelve more parked on
 * data-src, and a call to guest.vary.php that sets the cookie and tells the page
 * to reload. The reload is what serves the real document -- 75 scripts, 60 of them
 * with a live src. A visitor is on the placeholder for a few hundred milliseconds
 * and spends the rest of the visit on the real one.
 *
 * Capturing per-fresh-context froze the placeholder on all 427 pages. Nothing in
 * a static mirror performs that reload -- serve.mjs answers guest.vary.php with
 * reload:no, because there is nothing to reload to -- so the deferred scripts never
 * loaded: 2 same-origin scripts per page instead of 33-40, no elementorFrontend, no
 * Swiper, and every carousel, accordion, tab and popup dead. The homepage's six
 * badge images sat spinning on data-src that nothing swapped in.
 *
 * So the cookie is acquired up front and kept. Every page is then requested the way
 * a visitor sees it after the reload, which is the build worth mirroring.
 */
async function primedContext() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA })
  await ctx.request.post(`${ORIGIN}/wp-content/plugins/litespeed-cache/guest.vary.php`)
    .catch(() => {})
  const vary = (await ctx.cookies()).find((c) => c.name === '_lscache_vary')
  if (!vary) {
    console.error('WARNING: no _lscache_vary cookie. This run would capture the')
    console.error('         LiteSpeed guest placeholder, whose JavaScript never loads.')
    console.error('         Aborting rather than mirroring a site with no working JS.')
    await browser.close()
    process.exit(3)
  }
  console.log('LiteSpeed vary cookie acquired -- capturing the build a visitor ends on.')
  return ctx
}

const CTX = await primedContext()

/** Persist one response if it belongs to this site and we have not stored it. */
async function store(res) {
  const url = res.url()
  if (!url.startsWith(ORIGIN)) return
  if (res.status() !== 200) return
  // visit() writes the page's own document, rewritten. This handler fires for
  // that same response, and store() writes anything that is not CSS or JS
  // verbatim -- so both write the same path and whichever lands last decides
  // whether the page keeps live-origin URLs. It is a race, and it was lost on
  // 9 of 427 pages, each left with ~130 links and assets pointing at the live
  // site. Documents belong to visit(); everything else to store().
  if (res.request().resourceType() === 'document') return
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
  const ctx = CTX
  const page = await ctx.newPage()
  // Response bodies must be read before the context closes, so keep hold of
  // every store() promise and settle them below. Fire-and-forget here silently
  // loses any asset whose body is still being read when the page goes away.
  const pending = []
  // Three document responses arrive per page: the real build that page.goto()
  // returns, then LiteSpeed's guest-mode reload of the SAME URL -- about 20%
  // smaller -- and any iframe. Keep only the FIRST body per URL: keying by URL and
  // letting the last win captures the reload, which is the wrong build and shrank
  // nine pages by ~95 KB when it was tried.
  //
  // This copy exists only as a fallback. Chromium keeps a response body just while
  // it holds the resource, and it sometimes evicts the document before res.text()
  // is called -- which threw, so visit() bailed before its rewritten write and left
  // whatever store() had written verbatim. That is what stranded those nine pages.
  const docs = new Map()
  page.on('response', (r) => {
    if (r.request().resourceType() === 'document') {
      if (!docs.has(r.url())) {
        docs.set(r.url(), r.body().then((b) => b.toString('utf8')).catch(() => null))
      }
      return
    }
    pending.push(store(r).catch(() => {}))
  })
  try {
    const res = await page.goto(ORIGIN + route, { waitUntil: 'load', timeout: 60000 })

    // page.goto()'s own response is the right build; the captured copy is only for
    // when Chromium has already evicted it.
    let html = await res.text().catch(() => null)
    if (html === null) html = await docs.get(res.url())
    if (html === null || html === undefined) throw new Error('could not read the document body')
    // Scroll so lazy images and any deferred CSS actually get requested.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 800) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30))
      }
      window.scrollTo(0, 0)
    }).catch(() => {})
    await page.waitForTimeout(1500)

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
    // Written verbatim, deliberately. These files exist to tell a crawler where
    // things are, and both specs require an absolute URL to do it: a sitemap
    // <loc> that is root-relative makes the whole file invalid, and a relative
    // Sitemap: line in robots.txt is ignored. The rewrite that makes pages
    // origin-independent would flatten every one of them, so it is not applied
    // here. KEEP_ABSOLUTE cannot help: it matches HTML tags, not <loc> or RSS.
    await writeFile(file, body)
    stats.assets++
    return null
  } catch (e) { return `${urlPath} — ${e.message}` }
}

const orphans = ['/robots.txt', '/sitemap_index.xml', '/post-sitemap.xml', '/page-sitemap.xml',
  '/testimonial-sitemap.xml', '/category-sitemap.xml', '/feed/', '/comments/feed/']
if (FULL_RUN) {
  console.log(`\nFetching ${orphans.length} files no page links to (sitemaps, robots, feeds)…`)
  for (const o of orphans) {
    const err = await fetchDirect(o)
    if (err) stats.failed.push(`orphan ${err}`)
  }
} else {
  console.log('\nPartial run: leaving the sitemaps, robots.txt, feeds and _redirects alone.')
}

// serve.mjs replays this file, so a redirect on the live site stays a redirect
// here rather than becoming a duplicate page under the wrong URL.
if (FULL_RUN && recordedRedirects.length) {
  const dest = join(OUT, '_redirects')
  if (!existsSync(dest)) {
    const header = '# Redirects observed on the live site, replayed by build/serve.mjs\n'
    await writeFile(dest, header + recordedRedirects.join('\n') + '\n')
    console.log(`wrote ${recordedRedirects.length} redirect(s) to _redirects`)
  } else {
    // _redirects is curated: every rule was verified against live by hand, and the
    // file carries the comments explaining why. A run only ever observes redirects
    // among the handful of orphan files, so rebuilding the file from that drops the
    // rest -- it would have been 5 verified rules replaced by 1 observed. Report the
    // drift and let a person reconcile it.
    const have = new Set((await readFile(dest, 'utf8')).split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => l.trim().split(/\s+/)[0]))
    const novel = recordedRedirects.filter((r) => !have.has(r.split(/\s+/)[0]))
    console.log(`observed ${recordedRedirects.length} redirect(s); _redirects left alone (curated)`)
    if (novel.length) {
      console.log(`  ${novel.length} not in _redirects -- add by hand if real:`)
      for (const r of novel) console.log(`     ${r}`)
    }
  }
}

await browser.close()
console.log('\n--- browser mirror complete ---')
console.log(`pages:   ${stats.pages}`)
console.log(`assets:  ${stats.assets}`)
console.log(`failed:  ${stats.failed.length}`)
for (const f of stats.failed.slice(0, 20)) console.log(`  ! ${f}`)
