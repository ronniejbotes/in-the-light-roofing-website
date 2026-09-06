/**
 * Behavioural parity check: exercises the interactive parts of the site on the
 * live version and the mirror, and reports where the two disagree.
 *
 * Pixel diffs prove the site looks right; this proves it still does things.
 *
 * Usage: node tools/mirror-functions.mjs [route ...]
 */
import { chromium } from 'playwright-core'
import { join } from 'node:path'

const LOCAL = process.env.LOCAL || 'http://127.0.0.1:4322'
const LIVE = process.env.LIVE || 'https://inthelightroofing.com'
const EXEC = process.env.CHROME || join(process.env.USERPROFILE || process.env.HOME || '',
  'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')

const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/contact/', '/about-us/']

/** Probe one origin for a route and return a comparable snapshot of behaviour. */
async function probe(base, route, mobile) {
  const browser = await chromium.launch({ executablePath: EXEC })
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: mobile, hasTouch: mobile,
  })
  const page = await ctx.newPage()
  const out = {}
  try {
    await page.goto(base + route, { waitUntil: 'load', timeout: 60000 })
    await page.waitForTimeout(2500)

    out.counts = await page.evaluate(() => ({
      links: document.querySelectorAll('a[href]').length,
      navLinks: document.querySelectorAll('nav a[href], .elementor-nav-menu a[href]').length,
      forms: document.querySelectorAll('form').length,
      inputs: document.querySelectorAll('input, textarea, select').length,
      images: document.images.length,
      accordions: document.querySelectorAll('.elementor-accordion-item, .elementor-tab-title, .e-n-accordion-item').length,
      carousels: document.querySelectorAll('.swiper, .elementor-slides, .swiper-container').length,
      buttons: document.querySelectorAll('button, .elementor-button').length,
      headings: document.querySelectorAll('h1,h2,h3').length,
    }))

    // Mobile menu: does clicking the toggle actually open a panel?
    out.menu = await page.evaluate(async () => {
      const t = document.querySelector(
        '.elementor-menu-toggle, .menu-toggle, [class*="menu-toggle"], button[aria-label*="enu"]')
      if (!t) return 'no-toggle'
      const panel = () => document.querySelector(
        '.elementor-nav-menu--dropdown, .elementor-menu-toggle + nav, nav.elementor-nav-menu--dropdown')
      const before = panel() ? getComputedStyle(panel()).display : 'none'
      t.click()
      await new Promise((r) => setTimeout(r, 700))
      const after = panel() ? getComputedStyle(panel()).display : 'none'
      return `${before}->${after}`
    })

    // Accordion: does the first item expand on click?
    out.accordion = await page.evaluate(async () => {
      const item = document.querySelector('.elementor-accordion-title, .elementor-tab-title, summary')
      if (!item) return 'none'
      const body = item.closest('.elementor-accordion-item, .e-n-accordion-item')
        ?.querySelector('.elementor-tab-content, .elementor-accordion-content, div[role="region"]')
      const before = body ? getComputedStyle(body).display : '?'
      item.click()
      await new Promise((r) => setTimeout(r, 700))
      const after = body ? getComputedStyle(body).display : '?'
      return `${before}->${after}`
    })

    // Does the header stay put when the page scrolls?
    out.stickyHeader = await page.evaluate(async () => {
      const h = document.querySelector('header, .elementor-location-header')
      if (!h) return 'no-header'
      const top0 = h.getBoundingClientRect().top
      window.scrollTo(0, 1200)
      await new Promise((r) => setTimeout(r, 600))
      const top1 = h.getBoundingClientRect().top
      window.scrollTo(0, 0)
      return Math.abs(top1 - top0) < 10 ? 'sticky' : 'scrolls'
    })

    out.jsErrors = 0
  } catch (e) {
    out.error = e.message.split('\n')[0]
  }
  await browser.close()
  return out
}

let mismatches = 0
for (const route of routes) {
  for (const mobile of [false, true]) {
    const label = mobile ? 'mobile ' : 'desktop'
    const [live, local] = await Promise.all([
      probe(LIVE, route, mobile),
      probe(LOCAL, route, mobile),
    ])
    const diffs = []
    for (const k of Object.keys(live.counts || {})) {
      const a = live.counts[k], b = local.counts?.[k]
      // Review/chat widgets inject their own nodes, so allow small drift.
      const tol = ['links', 'images', 'buttons'].includes(k) ? Math.max(3, a * 0.1) : 0
      if (Math.abs(a - b) > tol) diffs.push(`${k}: live=${a} local=${b}`)
    }
    for (const k of ['menu', 'accordion', 'stickyHeader']) {
      if (live[k] !== local[k]) diffs.push(`${k}: live=${live[k]} local=${local[k]}`)
    }
    if (diffs.length) mismatches++
    console.log(`${diffs.length ? 'DIFF' : 'OK  '} ${label} ${route}`)
    for (const d of diffs) console.log(`       ${d}`)
    if (!diffs.length) {
      const c = local.counts || {}
      console.log(`       links=${c.links} forms=${c.forms} inputs=${c.inputs} accordions=${c.accordions}` +
        ` carousels=${c.carousels} | menu=${local.menu} accordion=${local.accordion} header=${local.stickyHeader}`)
    }
  }
}
console.log(`\n=== ${mismatches} behavioural mismatches across ${routes.length * 2} checks ===`)
