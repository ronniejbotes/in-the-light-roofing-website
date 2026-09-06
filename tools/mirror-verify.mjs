/**
 * Compares the local mirror against the live site, route by route.
 *
 * For each route it loads both, captures a full-page screenshot, and reports
 * the share of pixels that differ, alongside console errors and failed
 * requests on the local copy.
 *
 * Usage:
 *   node tools/mirror-verify.mjs                    # sample of routes
 *   node tools/mirror-verify.mjs / /contact/        # specific routes
 *   ROUTES_FILE=routes.txt node tools/mirror-verify.mjs
 */
import { chromium } from 'playwright-core'
import sharp from 'sharp'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, process.env.SHOT_DIR || 'shots/verify')
const LOCAL = process.env.LOCAL || 'http://127.0.0.1:4322'
const LIVE = process.env.LIVE || 'https://inthelightroofing.com'
const WIDTH = Number(process.env.WIDTH || 1440)
const EXEC = process.env.CHROME || join(process.env.USERPROFILE || process.env.HOME || '',
  'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')

// Third-party widgets render differently on every load (review carousels, chat
// bubbles, tracking pixels). They are hidden on both sides so the diff reports
// on the site itself rather than on network weather.
const MASK_CSS = `
  iframe, .trustindex-widget, [class*="trustindex"], [id*="trustindex"],
  [id*="fastbots"], [class*="fastbots"], .grecaptcha-badge,
  [src*="clickcease"], [src*="googletagmanager"] { visibility: hidden !important; }
  *, *::before, *::after { animation: none !important; transition: none !important;
    caret-color: transparent !important; }
`

const routes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : process.env.ROUTES_FILE
    ? (await readFile(process.env.ROUTES_FILE, 'utf8')).split('\n').map((s) => s.trim()).filter(Boolean)
    : ['/', '/about-us/', '/contact/', '/services/', '/past-work/', '/service-area/']

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: EXEC })

/** Load a URL and return {png, errors, failed}. */
async function shoot(url, tag) {
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()
  const errors = []
  const failed = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('requestfailed', (r) => {
    const u = r.url()
    if (u.startsWith(LOCAL) || u.startsWith(LIVE)) failed.push(u.replace(LOCAL, '').replace(LIVE, ''))
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && (r.url().startsWith(LOCAL) || r.url().startsWith(LIVE)))
      failed.push(`${r.status()} ${r.url().replace(LOCAL, '').replace(LIVE, '')}`)
  })
  let navOk = true
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  } catch (e) { navOk = false; errors.push(`NAV: ${e.message.split('\n')[0]}`) }

  await page.addStyleTag({ content: MASK_CSS })
  // Let lazy images and web fonts settle, then freeze scroll position.
  await page.evaluate(async () => {
    await new Promise((r) => {
      let y = 0
      const step = () => {
        y += 600
        window.scrollTo(0, y)
        if (y < document.body.scrollHeight) setTimeout(step, 40)
        else { window.scrollTo(0, 0); setTimeout(r, 400) }
      }
      step()
    })
  })
  try { await page.evaluate(() => document.fonts.ready) } catch {}
  await page.waitForTimeout(1200)

  const png = await page.screenshot({ fullPage: true })
  const height = await page.evaluate(() => document.body.scrollHeight)
  const title = await page.title()
  const h1 = await page.evaluate(() =>
    [...document.querySelectorAll('h1')].map((e) => e.textContent.trim()))
  await ctx.close()
  return { png, errors, failed, height, title, h1, navOk, tag }
}

/** Share of pixels differing beyond a small tolerance, after size-matching. */
async function diffRatio(aPng, bPng, outPath) {
  const a = sharp(aPng), b = sharp(bPng)
  const ma = await a.metadata(), mb = await b.metadata()
  const w = Math.min(ma.width, mb.width)
  const h = Math.min(ma.height, mb.height)
  const [ra, rb] = await Promise.all([
    sharp(aPng).extract({ left: 0, top: 0, width: w, height: h }).raw().toBuffer(),
    sharp(bPng).extract({ left: 0, top: 0, width: w, height: h }).raw().toBuffer(),
  ])
  const channels = 3
  let differing = 0
  const total = w * h
  const heat = Buffer.alloc(total * channels, 255)
  for (let i = 0; i < total; i++) {
    const o = i * channels
    const d = Math.abs(ra[o] - rb[o]) + Math.abs(ra[o + 1] - rb[o + 1]) + Math.abs(ra[o + 2] - rb[o + 2])
    if (d > 45) {
      differing++
      heat[o] = 255; heat[o + 1] = 0; heat[o + 2] = 0
    } else {
      const g = 235
      heat[o] = g; heat[o + 1] = g; heat[o + 2] = g
    }
  }
  await sharp(heat, { raw: { width: w, height: h, channels } }).png().toFile(outPath)
  return {
    ratio: differing / total,
    sizeDelta: Math.abs(ma.height - mb.height),
    liveH: ma.height, localH: mb.height,
  }
}

const results = []
for (const route of routes) {
  const slug = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'
  const live = await shoot(LIVE + route, 'live')
  const local = await shoot(LOCAL + route, 'local')
  await writeFile(join(OUT, `${slug}.live.png`), live.png)
  await writeFile(join(OUT, `${slug}.local.png`), local.png)
  const d = await diffRatio(live.png, local.png, join(OUT, `${slug}.diff.png`))
  const similarity = (1 - d.ratio) * 100
  results.push({ route, similarity, ...d, live, local })
  console.log(
    `${similarity >= 95 ? 'OK  ' : 'FAIL'} ${similarity.toFixed(2).padStart(6)}%  ${route}` +
    `  h(live=${d.liveH} local=${d.localH})` +
    (local.failed.length ? `  local-404s=${local.failed.length}` : '') +
    (local.errors.length ? `  local-errors=${local.errors.length}` : '')
  )
  if (local.title !== live.title) console.log(`      title differs:\n        live : ${live.title}\n        local: ${local.title}`)
  for (const f of [...new Set(local.failed)].slice(0, 8)) console.log(`      miss: ${f}`)
  for (const e of [...new Set(local.errors)].slice(0, 5)) console.log(`      err : ${e}`)
}

await browser.close()

const avg = results.reduce((s, r) => s + r.similarity, 0) / results.length
const worst = [...results].sort((a, b) => a.similarity - b.similarity).slice(0, 10)
console.log(`\n=== average similarity: ${avg.toFixed(2)}% over ${results.length} routes ===`)
console.log(`=== routes below 95%: ${results.filter((r) => r.similarity < 95).length} ===`)
for (const r of worst) if (r.similarity < 95) console.log(`   ${r.similarity.toFixed(2)}%  ${r.route}`)
console.log(`\nScreenshots + diff heatmaps in ${OUT}`)
await writeFile(join(OUT, 'report.json'), JSON.stringify(
  results.map(({ route, similarity, liveH, localH, local }) =>
    ({ route, similarity, liveH, localH, failed: [...new Set(local.failed)], errors: [...new Set(local.errors)] })), null, 2))
