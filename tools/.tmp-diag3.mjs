import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC = join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const route = process.argv[2]
const browser = await chromium.launch({ executablePath: EXEC })
const grab = async (base) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const fontFails = []
  page.on('response', r => { if (/\.(woff2?|ttf)/.test(r.url()) && r.status()>=400) fontFails.push(r.status()+' '+r.url()) })
  page.on('requestfailed', r => { if (/\.(woff2?|ttf)/.test(r.url())) fontFails.push('FAIL '+r.url()) })
  await page.goto(base + route, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(async () => { for (let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,40))} window.scrollTo(0,0) })
  await page.waitForTimeout(3000)
  const d = await page.evaluate(() => ({
    footer: (document.querySelector('footer')?.innerText||'').trim(),
    fonts: [...new Set([...document.querySelectorAll('h1,h2,h3,p,a,body')].map(e=>getComputedStyle(e).fontFamily.split(',')[0]))].slice(0,6),
    loadedFonts: [...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight).slice(0,12),
  }))
  await ctx.close(); return {...d, fontFails}
}
const live = await grab('https://inthelightroofing.com')
const local = await grab('http://127.0.0.1:4322')
console.log('=== LIVE fonts loaded ==='); console.log(live.loadedFonts.join('\n'))
console.log('=== LOCAL fonts loaded ==='); console.log(local.loadedFonts.join('\n'))
console.log('=== LOCAL font failures ==='); console.log(local.fontFails.slice(0,10).join('\n')||'(none)')
console.log('\n=== LIVE FOOTER ==='); console.log(live.footer)
console.log('\n=== LOCAL FOOTER ==='); console.log(local.footer)
await browser.close()
