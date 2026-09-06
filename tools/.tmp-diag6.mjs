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
    // first review badge column inside the header
    const col = document.querySelectorAll('header .elementor-col-20')[0]
    if (!col) return { err: 'no col' }
    const out = []
    const rec = (el, d) => {
      const b = el.getBoundingClientRect(); const cs = getComputedStyle(el)
      out.push({ d, tag: el.tagName, cls:(el.className||'').toString().slice(0,42),
        h: Math.round(b.height), w: Math.round(b.width), disp: cs.display,
        fd: cs.flexDirection, fw: cs.flexWrap, fs: cs.fontSize,
        src: el.tagName==='IMG' ? (el.currentSrc||el.src).split('/').pop().slice(0,40) : '',
        nat: el.tagName==='IMG' ? `${el.naturalWidth}x${el.naturalHeight}` : '',
        txt: el.children.length===0 ? (el.textContent||'').trim().slice(0,28) : '' })
      if (d < 6) [...el.children].forEach(c => rec(c, d+1))
    }
    rec(col, 0); return { out }
  })
  await ctx.close(); return r
}
const [live, local] = [await walk('https://inthelightroofing.com'), await walk('http://127.0.0.1:4322')]
const A=live.out||[], B=local.out||[]
for (let i=0;i<Math.max(A.length,B.length);i++){
  const a=A[i], b=B[i]
  const same = a&&b&&a.h===b.h&&a.w===b.w
  console.log(`${same?'   ':'>> '}[${i}] d${a?.d??b?.d}  LIVE ${a?a.h+'x'+a.w:'--'} ${a?.disp||''}/${a?.fd||''}/${a?.fw||''} fs=${a?.fs||''}  | LOCAL ${b?b.h+'x'+b.w:'--'} ${b?.disp||''}/${b?.fd||''}/${b?.fw||''} fs=${b?.fs||''}  ${(a||b).tag}.${(a||b).cls} ${(a||b).src?'img='+(a||b).src+' nat='+a?.nat+'/'+b?.nat:''} ${(a||b).txt?'txt='+(a||b).txt:''}`)
}
await browser.close()
