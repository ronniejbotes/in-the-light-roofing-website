/**
 * One-off check: is the review carousel on the live /past-work/ page actually
 * visible to a browser, or is it markup that never renders?
 */
import { chromium } from 'playwright-core'
import { join } from 'node:path'

const EXEC = join(process.env.USERPROFILE || '', 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const URL = process.argv[2] || 'https://inthelightroofing.com/past-work/'

const browser = await chromium.launch({ executablePath: EXEC })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
  await page.waitForTimeout(6000)

  const r = await page.evaluate(() => {
    const w = document.querySelector('.testimonials-wrapper')
    const items = [...document.querySelectorAll('.testimonial_box')]
    const visible = (el) => {
      const c = getComputedStyle(el)
      const b = el.getBoundingClientRect()
      return c.display !== 'none' && c.visibility !== 'hidden' &&
             c.opacity !== '0' && b.width > 0 && b.height > 0
    }
    return {
      wrapperFound: !!w,
      wrapperVisible: w ? visible(w) : false,
      wrapperBox: w ? { w: Math.round(w.getBoundingClientRect().width), h: Math.round(w.getBoundingClientRect().height) } : null,
      items: items.length,
      visibleItems: items.filter(visible).length,
      sampleText: w ? (w.innerText || '').trim().slice(0, 140) : '',
    }
  })
  console.log(JSON.stringify(r, null, 1))
} catch (e) {
  console.log('FAILED:', e.message.slice(0, 120))
} finally {
  await browser.close()
}
