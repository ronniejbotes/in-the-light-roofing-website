import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC = join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const browser = await chromium.launch({ executablePath: EXEC })
const walk = async (base) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(base + process.argv[2], { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(3000)
  const r = await page.evaluate(() => {
    const h = document.querySelector('header'); if (!h) return []
    const out = []
    const rec = (el, d) => {
      const b = el.getBoundingClientRect()
      if (d <= 8) out.push({ d, tag: el.tagName, cls: (el.className||'').toString().slice(0,60), h: Math.round(b.height), w: Math.round(b.width), disp: getComputedStyle(el).display })
      if (d < 8) [...el.children].forEach(c => rec(c, d+1))
    }
    rec(h, 0); return out
  })
  await ctx.close(); return r
}
const [live, local] = [await walk('https://inthelightroofing.com'), await walk('http://127.0.0.1:4322')]
const n = Math.max(live.length, local.length)
console.log('idx d  LIVE(h x w) disp        LOCAL(h x w) disp        tag.class')
for (let i=0;i<n;i++){
  const a=live[i], b=local[i]
  const mark = (!a||!b||a.h!==b.h) ? ' <<<' : ''
  console.log(`${String(i).padStart(3)} ${a?.d??'-'} ${String(a? a.h+'x'+a.w:'--').padEnd(12)}${(a?.disp||'').padEnd(12)} ${String(b? b.h+'x'+b.w:'--').padEnd(12)}${(b?.disp||'').padEnd(12)} ${(a||b)?.tag}.${(a||b)?.cls}${mark}`)
}
await browser.close()
