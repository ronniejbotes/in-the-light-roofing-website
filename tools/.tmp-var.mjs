import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC = join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const browser = await chromium.launch({ executablePath: EXEC })
for (const [tag, base] of [['LIVE ','https://inthelightroofing.com'],['TEST ','http://127.0.0.1:4323']]) {
  for (const route of ['/best-summer-roofing-materials-allentown/','/service-area/whitehall/']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    let reloads = 0
    page.on('framenavigated', f => { if (f === page.mainFrame()) reloads++ })
    await page.goto(base + route, { waitUntil: 'load', timeout: 60000 })
    await page.waitForTimeout(4000)
    const r = await page.evaluate(() => ({
      header: Math.round(document.querySelector('header').getBoundingClientRect().height),
      iconBox: getComputedStyle(document.querySelector('header .elementor-icon-box-wrapper')).display,
      sheets: document.styleSheets.length,
      ucss: [...document.querySelectorAll('link[href*="ucss"]')].length,
      lscss: [...document.querySelectorAll('link[href*="litespeed/css"]')].length,
      total: document.body.scrollHeight,
    }))
    console.log(`${tag} ${route.padEnd(42)} header=${r.header} iconBox=${r.iconBox} sheets=${r.sheets} ucss=${r.ucss} lscss=${r.lscss} navs=${reloads} total=${r.total}`)
    await ctx.close()
  }
}
await browser.close()
