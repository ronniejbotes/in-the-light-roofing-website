import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC = join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const browser = await chromium.launch({ executablePath: EXEC })
for (const [tag, base] of [['LIVE','https://inthelightroofing.com'],['TEST','http://127.0.0.1:4323']]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const css = []
  page.on('response', async r => {
    if (/\.css/.test(r.url())) {
      let hasFlex = null
      try { hasFlex = (await r.text()).includes('icon-box-wrapper{display:flex') } catch {}
      css.push(`${r.status()} flexRule=${hasFlex} ${r.url().split('/').pop().slice(0,50)}`)
    }
  })
  await page.goto(base + '/best-summer-roofing-materials-allentown/', { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(3000)
  console.log(`--- ${tag} ---`)
  for (const c of css) console.log('   ', c)
  await ctx.close()
}
await browser.close()
