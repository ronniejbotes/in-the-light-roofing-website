import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC = join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const route = process.argv[2]
const browser = await chromium.launch({ executablePath: EXEC })
const snap = async (base, tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(base + route, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(async () => { for (let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,40))} window.scrollTo(0,0) })
  await page.waitForTimeout(3000)
  const r = await page.evaluate(() => {
    const ti = document.querySelectorAll('[class*="trustindex"],[id*="trustindex"]')
    const inFooter = document.querySelector('footer')
    return {
      trustindexNodes: ti.length,
      trustindexHeights: [...ti].slice(0,6).map(e=>Math.round(e.getBoundingClientRect().height)),
      footerH: inFooter ? Math.round(inFooter.getBoundingClientRect().height) : 0,
      footerText: inFooter ? inFooter.innerText.trim().length : 0,
      headerH: Math.round((document.querySelector('header')||{getBoundingClientRect:()=>({height:0})}).getBoundingClientRect().height),
      headerText: (document.querySelector('header')?.innerText||'').trim().slice(0,120).replace(/\n/g,' | '),
      iframes: document.querySelectorAll('iframe').length,
    }
  })
  console.log(tag, JSON.stringify(r, null, 1))
  await ctx.close()
}
await snap('https://inthelightroofing.com','LIVE ')
await snap('http://127.0.0.1:4322','LOCAL')
await browser.close()
