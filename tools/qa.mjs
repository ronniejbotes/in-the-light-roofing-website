/**
 * Browser QA sweep: load a sample of every template and report console errors,
 * failed requests, missing H1s, horizontal overflow and unlabelled images.
 */
import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const EXEC = join(process.env.USERPROFILE || '', 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const BASE = 'http://127.0.0.1:4321'

const routes = JSON.parse(await readFile('.routes.json', 'utf8'))
const pick = (re, n) => routes.filter((r) => re.test(r)).slice(0, n)

const sample = [...new Set([
  '/', '/blog/', '/blog/page/2/', '/contact/', '/about-us/', '/past-work/',
  '/careers/', '/thank-you/', '/roof-types/', '/services/', '/service-area/',
  '/testimonial/', '/testimonial/page/2/', '/home/',
  ...pick(/^\/services\/[^/]+\/$/, 4),
  ...pick(/^\/service-area\/[^/]+\/$/, 3),
  ...pick(/^\/testimonial\/[^/]+\/$/, 2),
  ...pick(/^\/tag\//, 2),
  '/roof-repair/', '/roof-repair/page/2/', '/uncategorized/',
  ...pick(/^\/[a-z0-9-]{25,}\/$/, 4),
])]

const browser = await chromium.launch({ executablePath: EXEC })
const problems = []

for (const [label, w, h, mobile] of [['desktop', 1440, 900, false], ['mobile', 390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile })
  for (const route of sample) {
    const page = await ctx.newPage()
    const errs = []
    page.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text().slice(0, 90)))
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 90)))
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().startsWith(BASE)) errs.push(`HTTP ${r.status()} ${r.url().replace(BASE, '')}`)
    })
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 40000 })
      await page.waitForTimeout(350)
      const audit = await page.evaluate(() => {
        const de = document.documentElement
        const overflow = de.scrollWidth - de.clientWidth
        const wide = []
        if (overflow > 2) {
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect()
            if (r.right > de.clientWidth + 2 && r.width > 40) {
              wide.push(el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0] + ' w=' + Math.round(r.width))
              if (wide.length > 3) break
            }
          }
        }
        const imgs = [...document.images]
        return {
          h1: document.querySelectorAll('h1').length,
          overflow, wide,
          noAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
          noDims: imgs.filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).length,
          title: document.title.length,
        }
      })
      if (errs.length) problems.push([label, route, errs.slice(0, 3).join(' | ')])
      if (audit.h1 !== 1) problems.push([label, route, `h1 count = ${audit.h1}`])
      if (audit.overflow > 2) problems.push([label, route, `overflow ${audit.overflow}px: ${audit.wide.join(', ')}`])
      if (audit.noAlt) problems.push([label, route, `${audit.noAlt} img without alt`])
      if (audit.noDims) problems.push([label, route, `${audit.noDims} img without width/height`])
    } catch (e) {
      problems.push([label, route, 'LOAD FAILED: ' + e.message.slice(0, 70)])
    }
    await page.close()
  }
  await ctx.close()
}
await browser.close()

console.log(`Checked ${sample.length} routes x 2 viewports`)
if (!problems.length) { console.log('No problems found.'); process.exit(0) }
console.log(`\n${problems.length} problem(s):`)
for (const [v, r, m] of problems) console.log(`  [${v}] ${r}\n      ${m}`)
