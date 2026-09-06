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
  page.on('response', (r) => { store(r).catch(() => {}) })
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
    const file = pathToFile(route)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, rewrite(html, true))
    stats.pages++
  } catch (e) {
    stats.failed.push(`${route} — ${e.message.split('\n')[0]}`)
  }
  await page.close()
  if (stats.pages % 20 === 0) console.log(`  …${stats.pages}/${routes.length} pages, ${stats.assets} assets`)
  })
}

console.log(`Browser-mirroring ${routes.length} routes into ${OUT}`)
let i = 0
await Promise.all(Array.from({ length: TABS }, async () => {
  while (i < routes.length) await visit(routes[i++])
}))

await browser.close()
console.log('\n--- browser mirror complete ---')
console.log(`pages:   ${stats.pages}`)
console.log(`assets:  ${stats.assets}`)
console.log(`failed:  ${stats.failed.length}`)
for (const f of stats.failed.slice(0, 20)) console.log(`  ! ${f}`)
