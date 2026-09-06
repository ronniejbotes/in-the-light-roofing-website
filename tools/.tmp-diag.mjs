import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC = join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const route = process.argv[2]
const browser = await chromium.launch({ executablePath: EXEC })
const snap = async (base) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(base + route, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(async () => { for (let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,40))} window.scrollTo(0,0) })
  await page.waitForTimeout(2500)
  const r = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('section, .elementor-section, .elementor-top-section, footer, header').forEach((el, i) => {
      const b = el.getBoundingClientRect()
      out.push({ i, tag: el.tagName, cls: (el.className||'').toString().slice(0,55), top: Math.round(b.top + scrollY), h: Math.round(b.height) })
    })
    return { sections: out, total: document.body.scrollHeight }
  })
  await ctx.close(); return r
}
const [live, local] = [await snap('https://inthelightroofing.com'), await snap('http://127.0.0.1:4322')]
console.log(`total: live=${live.total} local=${local.total} delta=${local.total-live.total}`)
console.log(`sections: live=${live.sections.length} local=${local.sections.length}`)
const n = Math.min(live.sections.length, local.sections.length)
for (let i=0;i<n;i++){
  const a=live.sections[i], b=local.sections[i]
  const dh=b.h-a.h, dt=b.top-a.top
  if (Math.abs(dh)>8) console.log(`  [${i}] h: live=${a.h} local=${b.h} (${dh>0?'+':''}${dh})  top-shift=${dt}  ${a.tag}.${a.cls}`)
}
await browser.close()
