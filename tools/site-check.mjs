/**
 * Static acceptance checks over a published tree (publish/ or dist/).
 *
 *   node tools/site-check.mjs [dir]        # default: publish
 *   node tools/site-check.mjs dist --json report.json
 *
 * Checks what a crawler would trip over, without a browser and without a
 * network: internal link integrity against the files actually on disk, one H1
 * per page, title and description lengths and uniqueness among INDEXABLE pages,
 * self-canonicals on indexable pages, the sitemap agreeing with the robots
 * meta, absolute social-image URLs, JSON-LD that parses, a business node with
 * no self-serving rating, and alt coverage. Exit code 1 on any FAIL.
 *
 * It complements, not replaces, the browser checks (tools/shots.mjs, the
 * Playwright QA scripts): those prove the site works, this proves it is
 * indexable and consistent.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative, dirname, sep, resolve } from 'node:path'

const DIR = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'publish')
const JSON_OUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null
const SITE = 'https://inthelightroofing.com'

const fails = []
const warns = []
const info = {}
const fail = (k, msg, ex) => fails.push({ k, msg, ex })
const warn = (k, msg, ex) => warns.push({ k, msg, ex })

async function walk(d, out = []) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) await walk(p, out)
    else out.push(p)
  }
  return out
}

const files = await walk(DIR)
const fileSet = new Set(files.map((f) => relative(DIR, f).split(sep).join('/')))
const dirSet = new Set()
for (const f of fileSet) { const parts = f.split('/'); for (let i = 1; i < parts.length; i++) dirSet.add(parts.slice(0, i).join('/')) }

// .htaccess redirects, so a link to a redirected path is not counted broken.
const redirects = new Map()
if (existsSync(join(DIR, '.htaccess'))) {
  for (const m of (await readFile(join(DIR, '.htaccess'), 'utf8')).matchAll(/RewriteRule \^([^\s]+?)\/\?\$ (\S+) \[R=30\d/g)) {
    redirects.set('/' + m[1].replace(/\\([./])/g, '$1'), m[2])
  }
}

/** Does a root-relative path exist on disk (file, or dir with index.html)? */
function exists(path) {
  let p = decodeURIComponent(path.split('?')[0].split('#')[0])
  if (!p || p === '/') return fileSet.has('index.html')
  if (redirects.has(p.replace(/\/$/, '')) || redirects.has(p)) return true
  const rel = p.replace(/^\//, '').replace(/\/$/, '')
  return fileSet.has(rel) || fileSet.has(rel + '/index.html') || dirSet.has(rel)
}

const docs = []
for (const f of files) {
  if (!f.endsWith('index.html')) continue
  const html = await readFile(f, 'utf8')
  if (html.startsWith('<?xml')) continue
  const rel = relative(DIR, dirname(f)).split(sep).join('/')
  const url = rel === '' || rel === '.' ? '/' : `/${rel}/`
  docs.push({ url, file: f, html })
}
info.documents = docs.length

const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}=("([^"]*)"|'([^']*)')`, 'i')); return m ? (m[2] ?? m[3]) : null }
const meta = (html, key) => { const m = html.match(new RegExp(`<meta\\b(?=[^>]*\\b(?:name|property)=["']${key.replace(/[:.]/g, '\\$&')}["'])[^>]*>`, 'i')); return m ? attr(m[0], 'content') : null }
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&#8217;/g, '’').replace(/&#8211;/g, '–').replace(/&quot;/g, '"').replace(/&#039;/g, "'")

const brokenLinks = new Map()
const titles = new Map(), descs = new Map()
let indexable = 0, noindex = 0, imgs = 0, imgsNoAlt = 0, imgsLazy = 0, imgsDims = 0
let businessNodes = 0, ratingViolations = 0, relativeOg = 0, badJson = 0
const sitemapUrls = new Set()

for (const d of docs) {
  const { url, html } = d
  const robots = (meta(html, 'robots') || '').toLowerCase()
  // A page whose canonical names another URL has declared itself a duplicate:
  // it is not a search result in its own right, so it is held to the master's
  // standards, not its own (its title and description are expected to match).
  const canonTag = (html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || [''])[0]
  const canonHref = canonTag ? attr(canonTag, 'href') : null
  const isDuplicate = !!canonHref && canonHref !== SITE + url
  const isIndexable = !/noindex/.test(robots) && !isDuplicate
  if (isIndexable) indexable++; else noindex++
  if (isDuplicate) {
    if (/noindex/.test(robots)) fail('canonical', `${url} is both noindex and canonical to ${canonHref} -- one signal only`)
    const target = canonHref.startsWith(SITE) ? canonHref.slice(SITE.length) : canonHref
    if (target.startsWith('/') && !exists(target)) fail('canonical', `${url} canonicals to a page that does not exist: ${canonHref}`)
    info.duplicatesDeclared = (info.duplicatesDeclared || 0) + 1
  }

  // Headings
  const h1 = (html.match(/<h1\b/gi) || []).length
  if (h1 !== 1 && isIndexable) (h1 === 0 ? fail : warn)('h1', `${h1} <h1> on ${url}`)

  // Title / description
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).trim()
  const desc = decode(meta(html, 'description') || '')
  if (isIndexable) {
    if (!title) fail('title', `missing <title> on ${url}`)
    else { titles.set(title, [...(titles.get(title) || []), url]); if (title.length > 65) warn('title', `${title.length} chars on ${url}: "${title}"`) }
    if (!desc) fail('description', `missing meta description on ${url}`)
    else { descs.set(desc, [...(descs.get(desc) || []), url]); if (desc.length > 165 || desc.length < 60) warn('description', `${desc.length} chars on ${url}`) }
  }

  // Canonical
  if (isIndexable && !canonHref) fail('canonical', `no canonical on ${url}`)

  // Social images must be absolute.
  for (const k of ['og:image', 'twitter:image']) {
    const v = meta(html, k)
    if (v && !/^https?:\/\//i.test(v)) { relativeOg++; fail('og', `${k} is not absolute on ${url}: ${v}`) }
  }
  if (isIndexable && !meta(html, 'og:title')) warn('og', `no og:title on ${url}`)

  // JSON-LD
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let j
    try { j = JSON.parse(m[1]) } catch { badJson++; fail('jsonld', `invalid JSON-LD on ${url}`); continue }
    const nodes = Array.isArray(j) ? j : (j['@graph'] || [j])
    for (const n of nodes) {
      const t = [].concat(n['@type'] || [])
      if (t.some((x) => /RoofingContractor|LocalBusiness|HomeAndConstructionBusiness|Organization/.test(x))) {
        businessNodes++
        if (n.aggregateRating || n.review) { ratingViolations++; fail('jsonld', `self-serving rating on business node at ${url}`) }
        if (t.includes('ProfessionalService')) fail('jsonld', `deprecated ProfessionalService on ${url}`)
      }
      for (const k of ['image', 'logo', 'url', 'contentUrl', 'thumbnailUrl']) {
        const v = n[k]
        const vals = [].concat(v || []).map((x) => (typeof x === 'string' ? x : x && x.url)).filter(Boolean)
        for (const s of vals) if (typeof s === 'string' && s.startsWith('/')) fail('jsonld', `relative ${k} in JSON-LD on ${url}: ${s}`)
      }
    }
  }

  // Images
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0]
    if (/\bdata-thumbnail=/.test(tag)) continue // gallery placeholders
    imgs++
    const alt = attr(tag, 'alt')
    if (alt === null) imgsNoAlt++
    if (/\bloading=/.test(tag)) imgsLazy++
    if (/\swidth=/.test(tag) && /\sheight=/.test(tag)) imgsDims++
  }

  // Internal links and assets
  for (const m of html.matchAll(/\b(?:href|src)=["']([^"'#]+)(?:#[^"']*)?["']/gi)) {
    let u = m[1].trim()
    if (u.startsWith(SITE)) u = u.slice(SITE.length) || '/'
    if (!u.startsWith('/') || u.startsWith('//')) continue
    if (/^\/(?:\?|api\/|index\.php|litespeed-cache)/.test(u)) continue
    if (!exists(u)) {
      const e = brokenLinks.get(u) || { count: 0, pages: new Set() }
      e.count++; e.pages.add(url); brokenLinks.set(u, e)
    }
  }
}

// Duplicates among indexable pages
for (const [t, urls] of titles) if (urls.length > 1) fail('title', `duplicate title "${t}"`, urls)
for (const [t, urls] of descs) if (urls.length > 1) fail('description', `duplicate description (${urls.length} pages)`, urls)

// Sitemap vs indexability
const smIndex = join(DIR, 'sitemap_index.xml')
if (existsSync(smIndex)) {
  const idx = await readFile(smIndex, 'utf8')
  const subs = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, ''))
  for (const s of subs) {
    const p = join(DIR, s.replace(/^\//, ''))
    if (!existsSync(p)) { fail('sitemap', `sub-sitemap missing: ${s}`); continue }
    for (const m of (await readFile(p, 'utf8')).matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapUrls.add(m[1].replace(SITE, '') || '/')
  }
} else if (existsSync(join(DIR, 'sitemap.xml'))) {
  for (const m of (await readFile(join(DIR, 'sitemap.xml'), 'utf8')).matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapUrls.add(m[1].replace(SITE, '') || '/')
} else fail('sitemap', 'no sitemap_index.xml or sitemap.xml')

const byUrl = new Map(docs.map((d) => [d.url, d]))
for (const u of sitemapUrls) {
  const d = byUrl.get(u)
  if (!d) { fail('sitemap', `sitemap lists a URL that does not exist: ${u}`); continue }
  if (/noindex/i.test(meta(d.html, 'robots') || '')) fail('sitemap', `sitemap lists a noindex page: ${u}`)
  const c = (d.html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || [''])[0]
  const h = c ? attr(c, 'href') : null
  if (h && h !== SITE + u) fail('sitemap', `sitemap lists ${u} whose canonical is ${h}`)
}
const notInSitemap = docs.filter((d) => !/noindex/i.test(meta(d.html, 'robots') || '') && !sitemapUrls.has(d.url)).map((d) => d.url)
if (notInSitemap.length) warn('sitemap', `${notInSitemap.length} indexable pages not in sitemap`, notInSitemap.slice(0, 20))

// robots.txt
if (existsSync(join(DIR, 'robots.txt'))) {
  const r = await readFile(join(DIR, 'robots.txt'), 'utf8')
  info.robotsStaging = /^Disallow: \/\s*$/m.test(r)
  if (!/^Sitemap:/m.test(r) && !info.robotsStaging) warn('robots', 'robots.txt has no Sitemap line')
  if (/wp-admin|wp-includes/.test(r)) fail('robots', 'robots.txt still references WordPress paths')
}

for (const [u, e] of [...brokenLinks].sort((a, b) => b[1].count - a[1].count)) {
  fail('links', `broken internal target ${u} (${e.count}x)`, [...e.pages].slice(0, 5))
}

Object.assign(info, {
  indexable, noindex, sitemapUrls: sitemapUrls.size, images: imgs, imagesWithoutAlt: imgsNoAlt,
  imagesWithLoading: imgsLazy, imagesWithDims: imgsDims, businessNodes, ratingViolations, relativeOgImages: relativeOg, invalidJsonLd: badJson,
  brokenTargets: brokenLinks.size,
})
if (!businessNodes) warn('jsonld', 'no LocalBusiness/RoofingContractor node anywhere')

const groups = (arr) => { const g = {}; for (const x of arr) g[x.k] = (g[x.k] || 0) + 1; return g }
console.log(`site-check over ${relative(process.cwd(), DIR) || '.'}`)
console.log('  info:', JSON.stringify(info))
console.log(`  FAIL ${fails.length}  ${JSON.stringify(groups(fails))}`)
console.log(`  WARN ${warns.length}  ${JSON.stringify(groups(warns))}`)
const show = (list, n) => { for (const x of list.slice(0, n)) console.log(`    - [${x.k}] ${x.msg}${x.ex ? '  ' + JSON.stringify(x.ex).slice(0, 220) : ''}`); if (list.length > n) console.log(`    … ${list.length - n} more`) }
if (fails.length) { console.log('  failures:'); show(fails, 40) }
if (warns.length) { console.log('  warnings:'); show(warns, 25) }
if (JSON_OUT) await (await import('node:fs/promises')).writeFile(JSON_OUT, JSON.stringify({ info, fails, warns }, null, 2))
process.exit(fails.length ? 1 : 0)
