import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC = join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const browser = await chromium.launch({ executablePath: EXEC })
for (const [tag, base] of [['LIVE','https://inthelightroofing.com'],['LOCAL','http://127.0.0.1:4322']]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errs = [], pageErrs = []
  page.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,160)) })
  page.on('pageerror', e => pageErrs.push(e.message.split('\n')[0].slice(0,160)))
  await page.goto(base + process.argv[2], { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(3500)
  const st = await page.evaluate(() => {
    const sub = document.querySelector('footer .sub-menu, footer ul ul')
    return {
      jquery: typeof window.jQuery,
      elementorFrontend: typeof window.elementorFrontend,
      submenuDisplay: sub ? getComputedStyle(sub).display : 'no-submenu',
      submenuCount: document.querySelectorAll('footer .sub-menu, footer ul ul').length,
    }
  })
  console.log(`--- ${tag} ---`, JSON.stringify(st))
  console.log('  console errors:', errs.length ? errs.slice(0,6).join(' | ') : '(none)')
  console.log('  page errors   :', pageErrs.length ? pageErrs.slice(0,6).join(' | ') : '(none)')
  await ctx.close()
}
await browser.close()
