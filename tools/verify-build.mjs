/**
 * Build verification.
 *
 * 1. URL parity  -- every URL that returns 200 on the live site must exist in
 *                   dist/, or be covered by an explicit redirect.
 * 2. Link integrity -- every internal href in the built HTML must resolve to a
 *                   built page, a redirect, or a real static asset.
 * 3. SEO parity  -- title / description / robots / canonical must match what
 *                   the live site emits, byte for byte.
 *
 * Exits non-zero on any failure so it can gate a deploy.
 *
 * Checks 1 and 3 compare against a capture of the live site: capture-results.json
 * and raw/ under ITLR_SCRATCH. Both used to skip silently when that was absent --
 * check 1 warned, check 3 did not even do that -- and the run still finished with
 * "All checks passed" having compared nothing. Since the default location is a
 * machine-local temp directory that Windows clears, that is what any other machine,
 * a fresh clone, or CI would have got. Missing input is now a failure, not a pass.
 *
 *   ITLR_SCRATCH=/path/to/live-capture npm run verify:build
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const SCRATCH =
  process.env.ITLR_SCRATCH ||
  'C:/Users/ronja/AppData/Local/Temp/claude/c--Users-ronja-iCloudDrive-Documents-GitHub-in-the-light-roofing-website/e4f72178-8f47-4887-9127-6503e961e26b/scratchpad'

const fail = []
const warn = []
const note = (arr, msg) => arr.push(msg)

/* ---- collect built routes ------------------------------------------------ */

async function walk(dir, base = dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p, base)))
    else out.push('/' + relative(base, p).split('\\').join('/'))
  }
  return out
}

const files = await walk(DIST)
const built = new Set(
  files
    .filter((f) => f.endsWith('/index.html'))
    .map((f) => (f === '/index.html' ? '/' : f.replace(/index\.html$/, '')))
)
const assets = new Set(files)

/* ---- redirects ----------------------------------------------------------- */

const redirects = new Map()
const redirFile = join(ROOT, 'static', '_redirects')
if (existsSync(redirFile)) {
  for (const line of (await readFile(redirFile, 'utf8')).split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const [from, to] = t.split(/\s+/)
    if (from && to) redirects.set(from.replace(/\/?$/, '/'), to)
  }
}
const covered = (route) =>
  built.has(route) || redirects.has(route) || redirects.has(route.replace(/\/?$/, '/'))

/* ---- 1. URL parity against the live capture ------------------------------ */

const capturePath = join(SCRATCH, 'capture-results.json')
let liveRoutes = []
if (existsSync(capturePath)) {
  const cap = JSON.parse(await readFile(capturePath, 'utf8'))
  liveRoutes = Object.entries(cap)
    .filter(([, v]) => v.code === 200)
    .map(([p]) => p)
} else {
  note(fail,
    `No live capture at ${capturePath}, so URL parity and SEO parity cannot run.
` +
    `    Two of this tool's three checks compare against a capture of the live site.
` +
    `    Point ITLR_SCRATCH at a directory holding capture-results.json and raw/,
` +
    `    or treat this run as unverified -- it is not a pass.`)
}

const missing = liveRoutes.filter((r) => !covered(r))
if (missing.length) {
  note(fail, `${missing.length} live URL(s) have no page and no redirect:\n    ` + missing.slice(0, 40).join('\n    '))
}

const extra = [...built].filter((r) => liveRoutes.length && !liveRoutes.includes(r))
if (extra.length) note(warn, `${extra.length} built route(s) not present in the live capture: ${extra.slice(0, 10).join(', ')}`)

/* ---- 2. internal link integrity ------------------------------------------ */

const HREF = /(?:href|src)="([^"#][^"]*)"/g
const linkErrors = new Map()
let checkedLinks = 0

for (const f of files.filter((f) => f.endsWith('.html'))) {
  const html = await readFile(join(DIST, f), 'utf8')
  const from = f === '/index.html' ? '/' : f.replace(/index\.html$/, '')
  for (const m of html.matchAll(HREF)) {
    let href = m[1]
    if (/^(https?:|mailto:|tel:|data:|#)/i.test(href)) continue
    href = href.split('#')[0].split('?')[0]
    if (!href.startsWith('/')) continue
    checkedLinks++
    const isPage = href.endsWith('/')
    const ok = isPage ? covered(href) : assets.has(href) || covered(href)
    if (!ok) {
      if (!linkErrors.has(href)) linkErrors.set(href, new Set())
      linkErrors.get(href).add(from)
    }
  }
}

if (linkErrors.size) {
  const lines = [...linkErrors.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 30)
    .map(([h, froms]) => `    ${h}  (linked from ${froms.size} page(s), e.g. ${[...froms][0]})`)
  note(fail, `${linkErrors.size} internal link target(s) do not resolve:\n` + lines.join('\n'))
}

/* ---- 3. SEO parity ------------------------------------------------------- */

const pick = (html, re) => {
  const m = html.match(re)
  return m ? (m[1] ?? m[2]) : null
}
// WordPress emits these with single quotes and a trailing slash; ours use
// double quotes. Both forms must match, so the quote char is captured.
const TITLE = /<title>([\s\S]*?)<\/title>/i
const DESC = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i
const ROBOTS = /<meta\s+name=["']robots["']\s+content=["']([^"']*)["']/i
const CANON = /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i

const decode = (s) =>
  s == null ? null : s
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;|&#0?34;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()

const seoDiffs = []
let seoChecked = 0

for (const route of built) {
  const rel = route === '/' ? 'index.html' : route.slice(1) + 'index.html'
  const liveFile = join(SCRATCH, 'raw', rel)
  if (!existsSync(liveFile)) continue
  const live = await readFile(liveFile, 'utf8')
  const ours = await readFile(join(DIST, rel), 'utf8')
  seoChecked++

  for (const [name, re] of [['title', TITLE], ['description', DESC], ['robots', ROBOTS], ['canonical', CANON]]) {
    const a = decode(pick(live, re))
    const b = decode(pick(ours, re))
    if ((a || '') !== (b || '')) {
      seoDiffs.push({ route, field: name, live: a, ours: b })
    }
  }
}

if (seoDiffs.length) {
  const lines = seoDiffs.slice(0, 25).map(
    (d) => `    ${d.route} [${d.field}]\n       live: ${JSON.stringify(d.live)}\n       ours: ${JSON.stringify(d.ours)}`
  )
  note(fail, `${seoDiffs.length} SEO field(s) differ from the live site:\n` + lines.join('\n'))
}

/* ---- report -------------------------------------------------------------- */

console.log('Build verification')
console.log(`  built pages          ${built.size}`)
console.log(`  live 200 URLs        ${liveRoutes.length}`)
console.log(`  redirects declared   ${redirects.size}`)
console.log(`  internal links check ${checkedLinks}`)
console.log(`  SEO fields compared  ${seoChecked * 4} across ${seoChecked} pages`)

// A silent zero here is the failure mode this tool used to hide: every route
// skipped for want of a live file, and a green "All checks passed" on the end.
if (seoChecked === 0) {
  note(fail, `SEO parity compared 0 pages -- no live HTML found under ${join(SCRATCH, 'raw')}.`)
} else if (seoChecked < built.size) {
  note(warn, `SEO parity covered ${seoChecked} of ${built.size} built pages; ` +
    `${built.size - seoChecked} had no live capture to compare against.`)
}

for (const w of warn) console.log('\nWARN  ' + w)
for (const f of fail) console.log('\nFAIL  ' + f)

if (fail.length) {
  console.log(`\n${fail.length} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
