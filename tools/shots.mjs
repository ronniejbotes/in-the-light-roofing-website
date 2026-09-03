/**
 * Desktop and mobile screenshots of one or more routes, reporting console
 * errors and failed requests alongside. FULL=0 for viewport-only.
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = process.env.SHOT_DIR || 'shots'
const BASE = process.env.BASE || 'http://127.0.0.1:4321'
const EXEC = process.env.CHROME ||
  join(process.env.USERPROFILE || process.env.HOME || '',
       'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')

const targets = process.argv.slice(2)
const pages = targets.length ? targets : ['/']

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: EXEC })

for (const [label, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    isMobile: label === 'mobile',
    hasTouch: label === 'mobile',
  })
  const page = await ctx.newPage()
  // Reveal animations and sticky elements confuse full-page capture, so the
  // screenshots are taken with motion off -- the same state a visitor with
  // prefers-reduced-motion sees.
  const CALM = `*,*::before,*::after{animation:none!important;transition:none!important}
    .header{position:static!important}
    [data-reveal]{opacity:1!important;transform:none!important}`
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url().replace(BASE, '')))
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ` + r.url().replace(BASE, ''))
  })

  for (const p of pages) {
    const name = (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_'))
    await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 45000 })
    await page.addStyleTag({ content: CALM })
    await page.waitForTimeout(600)
    const full = process.env.FULL !== '0'
    await page.screenshot({ path: join(OUT, `${name}-${label}.png`), fullPage: full })
    console.log(`  shot ${name}-${label}`)
  }
  if (errors.length) {
    console.log(`\n[${label}] ${errors.length} console/network issue(s):`)
    for (const e of [...new Set(errors)].slice(0, 25)) console.log('   ' + e)
  } else {
    console.log(`[${label}] no console errors, no failed requests`)
  }
  await ctx.close()
}
await browser.close()
