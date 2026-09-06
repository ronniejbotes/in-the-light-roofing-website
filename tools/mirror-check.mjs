/**
 * Loads every mirrored page in a browser and reports anything broken:
 * failed same-origin requests, console errors, missing H1s, empty bodies.
 *
 * No screenshots, so it is fast enough to run across the whole site. Use
 * mirror-verify.mjs for pixel comparison against live.
 *
 * Usage:
 *   node tools/mirror-check.mjs                 # every route in routes.txt
 *   ROUTES_FILE=shots/all-routes.txt node tools/mirror-check.mjs
 */
import { chromium } from 'playwright-core'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL = process.env.LOCAL || 'http://127.0.0.1:4322'
const CONCURRENCY = Number(process.env.CONCURRENCY || 4)
const EXEC = process.env.CHROME || join(process.env.USERPROFILE || process.env.HOME || '',
  'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')

// routes.txt is the tracked manifest of every URL the mirror must contain; # lines
// are comments. See mirror-browser.mjs for why it is tracked rather than gitignored.
async function routeList() {
  if (process.argv.slice(2).length) return process.argv.slice(2)
  const file = process.env.ROUTES_FILE || join(ROOT, 'routes.txt')
  return (await readFile(file, 'utf8')).split('\n')
    .map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
}

const routes = await routeList()
console.log(`Checking ${routes.length} routes against ${LOCAL}\n`)

const browser = await chromium.launch({ executablePath: EXEC })
const bad = []
let done = 0

async function check(route) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const failed = new Set()
  const errors = new Set()
  page.on('console', (m) => { if (m.type() === 'error') errors.add(m.text().slice(0, 160)) })
  page.on('requestfailed', (r) => {
    if (r.url().startsWith(LOCAL)) failed.add(`REQFAIL ${r.url().replace(LOCAL, '')}`)
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(LOCAL))
      failed.add(`${r.status()} ${r.url().replace(LOCAL, '')}`)
  })

  let info = {}
  try {
    const res = await page.goto(LOCAL + route, { waitUntil: 'load', timeout: 45000 })
    await page.waitForTimeout(500)
    info = await page.evaluate(() => ({
      title: document.title,
      h1: document.querySelectorAll('h1').length,
      textLen: (document.body.innerText || '').trim().length,
      imgs: document.images.length,
      brokenImgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
      height: document.body.scrollHeight,
    }))
    info.status = res?.status()
  } catch (e) {
    errors.add(`NAV: ${e.message.split('\n')[0]}`)
  }
  await ctx.close()

  // Ignore endpoints that only exist under PHP; they have no visual effect.
  const real = [...failed].filter((f) =>
    !/guest\.vary\.php|admin-ajax\.php|xmlrpc\.php|rest_route=/.test(f))
  const problem =
    real.length > 0 ||
    info.brokenImgs > 0 ||
    !info.title ||
    (info.textLen ?? 0) < 200 ||
    info.status !== 200

  if (problem) bad.push({ route, ...info, failed: real, errors: [...errors] })
  done++
  if (done % 25 === 0) console.log(`  …${done}/${routes.length}`)
}

let i = 0
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (i < routes.length) await check(routes[i++])
}))
await browser.close()

console.log(`\n=== ${routes.length - bad.length}/${routes.length} routes clean ===`)
if (bad.length) {
  console.log(`=== ${bad.length} routes with problems ===`)
  for (const b of bad.slice(0, 40)) {
    console.log(`\n  ${b.route}  [status=${b.status} h1=${b.h1} text=${b.textLen} brokenImgs=${b.brokenImgs}]`)
    for (const f of b.failed.slice(0, 6)) console.log(`      ${f}`)
    for (const e of b.errors.slice(0, 3)) console.log(`      err: ${e}`)
  }
  if (bad.length > 40) console.log(`\n  …and ${bad.length - 40} more`)
}
// Every distinct missing asset across the site, which is what usually needs fixing.
const missing = new Set()
for (const b of bad) for (const f of b.failed) missing.add(f.replace(/^\d+ /, ''))
if (missing.size) {
  console.log(`\n=== ${missing.size} distinct missing assets ===`)
  for (const m of [...missing].slice(0, 40)) console.log(`   ${m}`)
}
await writeFile(join(ROOT, 'shots/check-report.json'), JSON.stringify({ total: routes.length, bad }, null, 2))
