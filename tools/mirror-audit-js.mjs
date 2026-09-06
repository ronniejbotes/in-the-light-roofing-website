/**
 * Check that the mirrored pages actually RUN, not just that they look right.
 *
 * The mirror once stored LiteSpeed's guest placeholder on all 427 pages. Every
 * check the repo had passed: the files were the right size, the links resolved,
 * the SEO fields matched, and a pixel diff put the pages at 99% of live. What
 * differed was invisible to all of that -- the placeholder defers its scripts
 * behind a reload that a static copy never performs, so two same-origin scripts
 * loaded instead of thirty-odd and every carousel, accordion, tab, popup and
 * mobile menu was inert.
 *
 * Nothing about the stored bytes reveals that. You have to run the page.
 *
 * Usage:
 *   node build/serve.mjs &            # or: npm run dev
 *   node tools/mirror-audit-js.mjs            # sample across every template
 *   node tools/mirror-audit-js.mjs --all      # every route in routes.txt
 *   node tools/mirror-audit-js.mjs --live     # compare each route against live
 *   node tools/mirror-audit-js.mjs / /contact/
 *
 * Exits non-zero if a page's JavaScript did not come up.
 */
import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL = process.env.LOCAL || 'http://127.0.0.1:4322'
const ORIGIN = 'https://inthelightroofing.com'
const EXEC = process.env.CHROME || join(process.env.USERPROFILE || process.env.HOME || '',
  'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// An Elementor page that is running loads its handler bundles; one that is not
// loads almost nothing. The gap is 30-odd files, so the threshold is not delicate.
const MIN_SAME_ORIGIN_JS = Number(process.env.MIN_JS || 10)

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const ALL = process.argv.includes('--all')
const LIVE = process.argv.includes('--live')

// One of each template, because the placeholder was served site-wide and any
// page would have shown it -- breadth matters more than depth here.
const SAMPLE = [
  '/',
  '/about-us/',
  '/contact/',
  '/services/',
  '/past-work/',
  '/roof-types/',
  '/blog/',
  '/blog/page/2/',
  '/service-area/allentown/',
  '/services/asphalt-shingle-roofing/',
  '/testimonial/abbe-ames/',
  '/tag/algae-prevention-tips/',
  '/roof-repair/',
  '/careers/',
]

async function routes() {
  if (args.length) return args
  if (!ALL) return SAMPLE
  return (await readFile(join(ROOT, 'routes.txt'), 'utf8')).split('\n')
    .map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
}

const browser = await chromium.launch({ executablePath: EXEC })

async function probe(base, route) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA })
  const page = await ctx.newPage()
  let js = 0
  page.on('response', (r) => {
    if (r.url().startsWith(base) && /\.js(\?|$)/.test(r.url())) js++
  })
  try {
    const res = await page.goto(base + route, { waitUntil: 'load', timeout: 60000 })
    if (res && res.status() !== 200) return { status: res.status() }
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 50))
      }
      window.scrollTo(0, 0)
    }).catch(() => {})
    await page.waitForTimeout(3000)
    const g = await page.evaluate(() => {
      const lazy = [...document.querySelectorAll('img.swiper-lazy')]
      return {
        elementor: typeof window.elementorFrontend !== 'undefined',
        jquery: typeof window.jQuery !== 'undefined',
        // A guest placeholder still carries the deferral attributes; a running
        // page has had them swapped out.
        deferredScripts: document.querySelectorAll('script[data-src]').length,
        lazyTotal: lazy.length,
        lazyLoaded: lazy.filter((i) => i.naturalWidth > 0).length,
      }
    })
    return { js, ...g }
  } catch (e) {
    return { error: e.message.split('\n')[0].slice(0, 70) }
  } finally {
    await ctx.close()
  }
}

const list = await routes()
console.log(`Checking JavaScript on ${list.length} route(s) against ${LOCAL}` +
  (LIVE ? ' and the live site' : '') + '\n')

const bad = []
for (const route of list) {
  const m = await probe(LOCAL, route)
  const l = LIVE ? await probe(ORIGIN, route) : null

  if (m.error) { bad.push(`${route} — ${m.error}`); console.log(`  ${route}  ERROR ${m.error}`); continue }
  if (m.status) {
    // Not a JS failure: the route does not resolve. Say so, rather than reporting
    // "no elementorFrontend" and sending someone hunting for a capture bug.
    const also = l && l.status ? ` (live also ${l.status})` : ''
    console.log(`  ${route.padEnd(42)} HTTP ${m.status} — not a page${also}`)
    bad.push(`${route}: HTTP ${m.status} from the mirror${also}`)
    continue
  }

  const problems = []
  if (!m.elementor) problems.push('no elementorFrontend')
  if (m.js < MIN_SAME_ORIGIN_JS) problems.push(`only ${m.js} same-origin JS`)
  if (m.deferredScripts > 0) problems.push(`${m.deferredScripts} scripts still on data-src (guest placeholder)`)
  if (m.lazyTotal && m.lazyLoaded < m.lazyTotal) problems.push(`${m.lazyTotal - m.lazyLoaded}/${m.lazyTotal} lazy images never loaded`)
  if (l && !l.error && l.elementor && !m.elementor) problems.push('live runs Elementor here and the mirror does not')

  const line = `  ${route.padEnd(42)} js=${String(m.js).padStart(3)} elementor=${m.elementor} lazy=${m.lazyLoaded}/${m.lazyTotal}` +
    (l && !l.error ? `   [live js=${String(l.js).padStart(3)} elementor=${l.elementor} lazy=${l.lazyLoaded}/${l.lazyTotal}]` : '')
  console.log(line + (problems.length ? '\n      ! ' + problems.join('; ') : ''))
  if (problems.length) bad.push(`${route}: ${problems.join('; ')}`)
}

await browser.close()
console.log(`\n${list.length - bad.length}/${list.length} route(s) running`)
if (bad.length) {
  console.log(`\n${bad.length} route(s) whose JavaScript did not come up:`)
  for (const b of bad) console.log(`   ${b}`)
  process.exit(1)
}
console.log('JavaScript comes up on every route checked.')
