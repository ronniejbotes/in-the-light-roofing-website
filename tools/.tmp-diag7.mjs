import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC = join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const browser = await chromium.launch({ executablePath: EXEC })
const q = async (base, tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(base + process.argv[2], { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(3500)
  const r = await page.evaluate(() => {
    const hits = []
    let total = 0, blocked = 0
    for (const ss of document.styleSheets) {
      let rules
      try { rules = ss.cssRules } catch { blocked++; continue }
      if (!rules) continue
      total += rules.length
      for (const r of rules) {
        if (r.selectorText && /icon-box-wrapper/.test(r.selectorText) && /display/.test(r.cssText))
          hits.push({ href: (ss.href||'inline').split('/').pop().slice(0,40), sel: r.selectorText.slice(0,80), css: r.cssText.slice(-70) })
      }
    }
    return { hits, sheets: document.styleSheets.length, total, blocked,
      computed: getComputedStyle(document.querySelector('header .elementor-icon-box-wrapper')).display }
  })
  console.log(`--- ${tag} --- sheets=${r.sheets} rules=${r.total} blocked=${r.blocked} computedDisplay=${r.computed}`)
  for (const h of r.hits) console.log(`    ${h.href}  ${h.sel}  …${h.css}`)
  if (!r.hits.length) console.log('    (no display rule found for icon-box-wrapper)')
  await ctx.close()
}
await q('https://inthelightroofing.com','LIVE ')
await q('http://127.0.0.1:4322','LOCAL')
await browser.close()
