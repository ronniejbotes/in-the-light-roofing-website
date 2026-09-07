/**
 * Page-weight and Web Vitals measurement of a served build, via Playwright +
 * Chrome DevTools Protocol. Cold cache, no compression (build/serve.mjs sends
 * the files raw), so byte counts are upper bounds -- the real host gzips text.
 *
 *   node tools/perf-measure.mjs --base http://127.0.0.1:4601 --profile mobile4g --out before.json
 *   node tools/perf-measure.mjs --base http://127.0.0.1:4602 --profile desktop  --out after.json [/ /about-us/ ...]
 *   node tools/perf-measure.mjs --diff before.json after.json        # before/after table
 *
 * Profiles
 *   mobile4g   390x844, DPR 2, touch, 1.6 Mbps down / 750 kbps up / 150 ms RTT, CPU x4
 *   desktop    1440x900, DPR 1, unthrottled
 *
 * Per URL and profile it records
 *   - bytes and request count by type (html/css/js/img/font/video/other), split
 *     into what was fetched before the load event ("initial"), after load but
 *     before any scrolling ("settled" -- this is where lazily woken third
 *     parties land), and after scrolling the whole page ("full")
 *   - third-party bytes, and bytes per third-party host
 *   - FCP, LCP (ms and the element), CLS with its sources, long tasks
 *   - render-blocking <head> stylesheets and synchronous scripts
 *   - every request whose host is the live WordPress site or the migration
 *     temp host -- the static build must make none (CallRail and Google
 *     excepted, those are third parties in their own right)
 *   - DOM node count, review-marquee card count, Swiper slide/clone counts
 *
 * Numbers vary run to run by 10-20% on the throttled profile; compare
 * directions and orders of magnitude, not single milliseconds.
 *
 * Playwright's chromium (playwright-core is in node_modules) is used with the
 * browser already downloaded to ms-playwright; set CHROME to point elsewhere.
 * Git Bash rewrites leading-slash arguments as paths: run with
 * MSYS_NO_PATHCONV=1 when passing page paths.
 */
import { chromium } from 'playwright-core'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'

const EXE = process.env.CHROME || 'C:/Users/ronja/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
const DEFAULT_PAGES = ['/', '/services/roof-repairs/', '/service-area/allentown/', '/past-work/', '/contact/', '/about-us/', '/how-much-does-a-new-roof-cost-in-pennsylvania/']
const PROFILES = {
  mobile4g: {
    viewport: { width: 390, height: 844 }, dpr: 2, mobile: true,
    ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
    net: { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 },
    cpu: 4, settleMs: 6000, scrollSettleMs: 8000,
  },
  desktop: { viewport: { width: 1440, height: 900 }, dpr: 1, mobile: false, ua: null, net: null, cpu: 1, settleMs: 4000, scrollSettleMs: 4000 },
}

/* Hosts the static build must never call. */
const FORBIDDEN_HOSTS = /(^|\.)inthelightroofing\.com$|temp-site\.link$/i
/* Third parties that legitimately stay (tags and call tracking). */
const ALLOWED_THIRD = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|cdn\.callrail\.com|google\.com|gstatic\.com/i

/* ---------------------------------------------------------------- args */

const argv = process.argv.slice(2)
const opt = (name, dflt) => { const i = argv.indexOf(name); return i === -1 ? dflt : argv[i + 1] }
const has = (name) => argv.includes(name)

if (has('--diff')) {
  const i = argv.indexOf('--diff')
  diff(argv[i + 1], argv[i + 2])
  process.exit(0)
}

const BASE = (opt('--base', process.env.BASE || 'http://127.0.0.1:4500')).replace(/\/$/, '')
const profileName = opt('--profile', 'desktop')
const PROF = PROFILES[profileName]
if (!PROF) throw new Error('unknown profile ' + profileName + ' (mobile4g | desktop)')
const OUT_FILE = opt('--out', null)
const SHOT_DIR = opt('--shots', null)
const PAGES = argv.filter((a) => a.startsWith('/'))
const pages = PAGES.length ? PAGES : DEFAULT_PAGES

/* ---------------------------------------------------------- observers */

const INIT = `
window.__perf = { lcp: [], cls: 0, clsEntries: [], longTasks: [], fcp: null };
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) {
  var el = e.element;
  window.__perf.lcp.push({ t: Math.round(e.startTime), size: e.size, url: e.url || null,
    tag: el ? el.tagName : null, cls: el ? String(el.className).slice(0, 80) : null, id: el ? el.id : null,
    text: el && !e.url ? (el.textContent || '').trim().slice(0, 60) : null });
}); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) {
  if (e.hadRecentInput) return;
  window.__perf.cls += e.value;
  var srcs = (e.sources || []).map(function (s) { var n = s.node; return n && n.tagName ? n.tagName + (n.id ? '#' + n.id : '') + '.' + String(n.className).slice(0, 50) : String(n); });
  window.__perf.clsEntries.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: srcs.slice(0, 3) });
}); }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) {
  window.__perf.longTasks.push({ t: Math.round(e.startTime), d: Math.round(e.duration) });
}); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) {
  if (e.name === 'first-contentful-paint') window.__perf.fcp = Math.round(e.startTime);
}); }).observe({ type: 'paint', buffered: true }); } catch (e) {}
`

function classify(type, mime, url) {
  const u = url.toLowerCase().split('?')[0]
  if (type === 'Document') return 'html'
  if (type === 'Stylesheet' || u.endsWith('.css')) return 'css'
  if (type === 'Script' || u.endsWith('.js')) return 'js'
  if (type === 'Image' || /\.(png|jpe?g|webp|gif|svg|avif|ico)$/.test(u)) return 'img'
  if (type === 'Font' || /\.(woff2?|ttf|otf|eot)$/.test(u)) return 'font'
  if (type === 'Media' || /\.(mp4|webm|mp3|ogg)$/.test(u)) return 'video'
  if (mime && mime.startsWith('text/html')) return 'html'
  return 'other'
}
const hostOf = (u) => { try { return new URL(u).hostname } catch { return '?' } }
const firstParty = (u) => u.startsWith(BASE + '/') || u === BASE

/* ------------------------------------------------------------ measure */

async function measure(browser, path) {
  const url = BASE + path
  const ctx = await browser.newContext({
    viewport: PROF.viewport, deviceScaleFactor: PROF.dpr, isMobile: PROF.mobile, hasTouch: PROF.mobile,
    userAgent: PROF.ua || undefined, ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  await page.addInitScript(INIT)
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 200)))

  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  if (PROF.net) await cdp.send('Network.emulateNetworkConditions', PROF.net)
  if (PROF.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: PROF.cpu })

  const reqs = new Map()
  let phase = 'initial'
  cdp.on('Network.requestWillBeSent', (e) => {
    if (!reqs.has(e.requestId)) reqs.set(e.requestId, { url: e.request.url, method: e.request.method, type: e.type, phase, bytes: 0, mime: null, status: null })
    else reqs.get(e.requestId).url = e.request.url
  })
  cdp.on('Network.responseReceived', (e) => {
    const r = reqs.get(e.requestId); if (!r) return
    r.mime = e.response.mimeType; r.status = e.response.status; r.type = e.type
  })
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength })
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) r.failed = e.errorText })

  let navError = null
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 240000 })
  } catch (err) { navError = String(err.message).split('\n')[0] }
  phase = 'settled'
  await page.waitForTimeout(PROF.settleMs)

  const snap = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {}
    const p = window.__perf
    const lcp = p.lcp[p.lcp.length - 1] || null
    const headCss = [...document.head.querySelectorAll('link[rel="stylesheet"]')]
      .filter((l) => !l.disabled && (!l.media || l.media === 'all' || matchMedia(l.media).matches)).map((l) => l.getAttribute('href'))
    const headSync = [...document.head.querySelectorAll('script[src]')]
      .filter((s) => !s.defer && !s.async && s.type !== 'module' && s.type !== 'text/plain').map((s) => s.getAttribute('src'))
    const placeholders = document.querySelectorAll('script[data-itlr-defer]').length
    return {
      title: document.title,
      dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0),
      fcp: p.fcp, lcp, cls: +p.cls.toFixed(4), clsEntries: p.clsEntries.filter((e) => e.v >= 0.001).slice(0, 10),
      longTasksMs: p.longTasks.reduce((a, t) => a + t.d, 0), longTasksCount: p.longTasks.length,
      domNodes: document.getElementsByTagName('*').length,
      reviewCards: document.querySelectorAll('.itlr-review').length,
      reviewCols: document.querySelectorAll('.itlr-reviews__col').length,
      swiperSlides: document.querySelectorAll('.swiper-slide').length,
      swiperClones: document.querySelectorAll('.swiper-slide-duplicate').length,
      headCss, headSync, placeholders,
      iframes: [...document.querySelectorAll('iframe')].map((f) => (f.src || f.getAttribute('data-src') || '').slice(0, 80)),
      scrollHeight: document.documentElement.scrollHeight,
    }
  })

  // Scroll the page end to end so lazy images, iframes and the reviews marquee
  // all get their turn, then back to the top.
  phase = 'afterScroll'
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight
    for (let y = 0; y < h; y += Math.round(innerHeight * 0.8)) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) }
    scrollTo(0, h)
  })
  await page.waitForTimeout(PROF.scrollSettleMs)
  await page.evaluate(() => scrollTo(0, 0))
  await page.waitForTimeout(800)

  const after = await page.evaluate(() => ({
    domNodes: document.getElementsByTagName('*').length,
    reviewCards: document.querySelectorAll('.itlr-review').length,
    cls: +window.__perf.cls.toFixed(4),
    imgs: [...document.images].filter((i) => i.getBoundingClientRect().width > 0).map((i) => {
      const r = i.getBoundingClientRect()
      return { src: (i.currentSrc || i.src || '').replace(location.origin, '').slice(0, 120), rw: Math.round(r.width), rh: Math.round(r.height), nw: i.naturalWidth, nh: i.naturalHeight, loading: i.loading, fp: i.getAttribute('fetchpriority') }
    }),
  }))

  if (SHOT_DIR) {
    if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true })
    try { await page.screenshot({ path: `${SHOT_DIR}/${profileName}-${path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}.png` }) } catch {}
  }
  await ctx.close()

  const all = [...reqs.values()].filter((r) => !r.url.startsWith('data:'))
  function agg(list) {
    const byType = {}; const thirdHosts = {}; let first = 0, third = 0
    for (const r of list) {
      const t = classify(r.type, r.mime, r.url)
      byType[t] = byType[t] || { bytes: 0, n: 0 }; byType[t].bytes += r.bytes || 0; byType[t].n++
      if (firstParty(r.url)) first += r.bytes || 0
      else { third += r.bytes || 0; const h = hostOf(r.url); thirdHosts[h] = thirdHosts[h] || { bytes: 0, n: 0 }; thirdHosts[h].bytes += r.bytes || 0; thirdHosts[h].n++ }
    }
    return { requests: list.length, bytes: first + third, firstPartyBytes: first, thirdPartyBytes: third, byType, thirdHosts }
  }
  const initial = all.filter((r) => r.phase === 'initial')
  const settled = all.filter((r) => r.phase !== 'afterScroll')
  const forbidden = all.filter((r) => FORBIDDEN_HOSTS.test(hostOf(r.url)) && !ALLOWED_THIRD.test(hostOf(r.url)))
    .map((r) => ({ url: r.url.slice(0, 160), method: r.method, status: r.status, failed: r.failed || null, phase: r.phase }))
  const failed = all.filter((r) => r.failed || (r.status && r.status >= 400)).map((r) => ({ url: r.url.slice(0, 140), status: r.status, failed: r.failed }))
  const bytesOf = (href) => { const abs = href.startsWith('/') ? BASE + href : href; const r = all.find((x) => x.url === abs); return r ? r.bytes : null }

  return {
    url: path, profile: profileName, base: BASE, navError, consoleErrors: consoleErrors.slice(0, 20),
    initial: agg(initial), settled: agg(settled), full: agg(all),
    metrics: { fcp: snap.fcp, lcpMs: snap.lcp ? snap.lcp.t : null, lcpElement: snap.lcp ? `${snap.lcp.tag}${snap.lcp.id ? '#' + snap.lcp.id : ''} ${(snap.lcp.url || snap.lcp.text || '').slice(-70)}` : null,
      cls: snap.cls, clsAfterScroll: after.cls, clsEntries: snap.clsEntries, longTasksMs: snap.longTasksMs, longTasksCount: snap.longTasksCount, dcl: snap.dcl, load: snap.load },
    renderBlocking: { headCss: snap.headCss.map((h) => ({ href: h, bytes: bytesOf(h) })), headCssCount: snap.headCss.length, headSync: snap.headSync, headSyncCount: snap.headSync.length, placeholders: snap.placeholders },
    dom: { nodesAtLoad: snap.domNodes, nodesAfterScroll: after.domNodes, reviewCards: snap.reviewCards, reviewCardsAfterScroll: after.reviewCards, reviewCols: snap.reviewCols, swiperSlides: snap.swiperSlides, swiperClones: snap.swiperClones, scrollHeight: snap.scrollHeight },
    iframes: snap.iframes,
    forbiddenHostRequests: forbidden,
    failed,
    images: after.imgs,
    requests: all.map((r) => ({ url: r.url.replace(BASE, '').slice(0, 160), type: classify(r.type, r.mime, r.url), bytes: r.bytes, phase: r.phase, status: r.status })),
  }
}

/* --------------------------------------------------------------- diff */

// Function declarations, not const arrows: the --diff branch near the top of
// the file runs before this point is reached, and a `const` would still be in
// its temporal dead zone there.
function kb(n) { return n == null ? '-' : (n / 1024).toFixed(0) + 'K' }
function ms(n) { return n == null ? '-' : String(n) }
function pad(s, n) { return String(s).padEnd(n) }
function rpad(s, n) { return String(s).padStart(n) }

function diff(aFile, bFile) {
  const A = JSON.parse(readFileSync(aFile, 'utf8')), B = JSON.parse(readFileSync(bFile, 'utf8'))
  const key = (r) => r.profile + ' ' + r.url
  const bm = new Map(B.map((r) => [key(r), r]))
  console.log(pad('profile url', 52) + rpad('bytes(initial)', 20) + rpad('requests', 14) + rpad('LCP ms', 18) + rpad('CLS', 20) + rpad('long tasks ms', 16) + rpad('3P bytes', 18) + rpad('blocking css', 14) + rpad('WP/temp req', 13))
  for (const a of A) {
    const b = bm.get(key(a)); if (!b || !a.metrics || !b.metrics) continue
    const cell = (x, y, f = String) => `${f(x)} -> ${f(y)}`
    console.log(pad(key(a), 52)
      + rpad(cell(a.initial.bytes, b.initial.bytes, kb), 20)
      + rpad(cell(a.initial.requests, b.initial.requests), 14)
      + rpad(cell(a.metrics.lcpMs, b.metrics.lcpMs, ms), 18)
      + rpad(cell(a.metrics.cls, b.metrics.cls), 20)
      + rpad(cell(a.metrics.longTasksMs, b.metrics.longTasksMs, ms), 16)
      + rpad(cell(a.initial.thirdPartyBytes, b.initial.thirdPartyBytes, kb), 18)
      + rpad(cell(a.renderBlocking.headCssCount, b.renderBlocking.headCssCount), 14)
      + rpad(cell(a.forbiddenHostRequests.length, b.forbiddenHostRequests.length), 13))
  }
}

/* --------------------------------------------------------------- main */

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const out = []
for (const p of pages) {
  const t = Date.now()
  process.stdout.write(`[${profileName}] ${p} ... `)
  try {
    const r = await measure(browser, p)
    out.push(r)
    const m = r.metrics
    console.log(`${Math.round((Date.now() - t) / 1000)}s | initial ${kb(r.initial.bytes)}/${r.initial.requests}req | settled ${kb(r.settled.bytes)}/${r.settled.requests} | full ${kb(r.full.bytes)}/${r.full.requests} | LCP ${m.lcpMs}ms (${m.lcpElement}) | CLS ${m.cls} | LT ${m.longTasksMs}ms | DCL ${m.dcl} load ${m.load} | css ${r.renderBlocking.headCssCount} sync ${r.renderBlocking.headSyncCount} | nodes ${r.dom.nodesAtLoad} | WP/temp ${r.forbiddenHostRequests.length}${r.navError ? ' | NAV: ' + r.navError : ''}${r.consoleErrors.length ? ' | console errors ' + r.consoleErrors.length : ''}`)
  } catch (err) {
    console.log('FAILED', err.message.split('\n')[0])
    out.push({ url: p, profile: profileName, error: String(err.message) })
  }
  if (OUT_FILE) writeFileSync(OUT_FILE, JSON.stringify(out, null, 1))
}
await browser.close()
if (OUT_FILE) console.log('written ->', OUT_FILE)
