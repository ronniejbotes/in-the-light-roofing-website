/**
 * Browser QA sweep: load a sample of every template and report console errors,
 * failed requests, missing H1s, horizontal overflow and unlabelled images.
 */
import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Set CHROME to a Chromium/Chrome binary. The default is where Playwright puts
// its download on Windows; on macOS and Linux, pass CHROME explicitly.
const EXEC = process.env.CHROME ||
  join(process.env.USERPROFILE || '', 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
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
        // Text that fails WCAG AA against its own painted background. Catches
        // the classic regression where a dark-section rule turns a heading
        // white on top of a light card.
        const lum = (c) => {
          const [r, g, b] = c.map((v) => {
            const s = v / 255
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        const parse = (s) => {
          const m = s.match(/rgba?\(([^)]+)\)/)
          if (!m) return null
          const p = m[1].split(/[,/]/).map((x) => parseFloat(x))
          return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }
        }
        // Walk up for the first opaque painted background. Returns null when a
        // gradient or photo is in the way, since the effective backdrop behind
        // the glyphs cannot be read from computed styles.
        const bgOf = (el) => {
          let n = el
          while (n && n !== document.documentElement) {
            const cs = getComputedStyle(n)
            if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
            const c = parse(cs.backgroundColor)
            if (c && c.a > 0.85) return c.rgb
            n = n.parentElement
          }
          return [255, 255, 255]
        }
        const lowContrast = []
        const sel = 'h1,h2,h3,h4,h5,h6,p,li,a,span,button,td,th,figcaption,label'
        for (const el of document.querySelectorAll(sel)) {
          if (!el.textContent.trim()) continue
          if (el.querySelector(sel)) continue          // only leaf text
          const r = el.getBoundingClientRect()
          if (r.width < 8 || r.height < 8) continue
          const cs = getComputedStyle(el)
          if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue
          const fg = parse(cs.color)
          if (!fg || fg.a < 0.5) continue
          const bg = bgOf(el)
          if (!bg) continue
          const l1 = lum(fg.rgb), l2 = lum(bg)
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
          const size = parseFloat(cs.fontSize)
          const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700)
          if (ratio < (large ? 3 : 4.5)) {
            lowContrast.push(
              `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} ` +
              `"${el.textContent.trim().slice(0, 28)}" ${ratio.toFixed(1)}:1`
            )
            if (lowContrast.length > 4) break
          }
        }

        const imgs = [...document.images]
        return {
          lowContrast,
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
      if (audit.lowContrast?.length) problems.push([label, route, `low contrast: ${audit.lowContrast.join(' | ')}`])
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
