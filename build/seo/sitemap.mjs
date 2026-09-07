/**
 * Sitemaps and the live robots.txt, generated from what was actually published.
 *
 * The mirror carries Yoast's four sitemaps as captured. They describe the
 * WordPress site, not this build: 248 image entries went root-relative in the
 * declutter rename (a sitemap URL must be fully qualified), every file points
 * at an XSL stylesheet that no longer exists, the category and testimonial
 * files list pages this build keeps out of the index, the homepage drafts and
 * /thank-you/ are in, and the fixed asphalt-shingle service page is out
 * (Yoast drops any page carrying a canonical override, which is how a
 * nav-linked money page ended up in no sitemap at all).
 *
 * So the files are rewritten from the pages this pass just finished
 * processing. A URL is listed only if it is indexable (no noindex) and
 * self-canonical; anything declared a duplicate or thin falls out by itself.
 * The two filenames Search Console already knows -- post-sitemap.xml and
 * page-sitemap.xml under sitemap_index.xml -- are kept; a child that would be
 * empty is deleted rather than left as a stale copy for anyone holding the
 * old URL. lastmod is carried over from Yoast's files where it had one, and
 * from the page's own dateModified otherwise, because inventing a date tells
 * Google every page changed today.
 *
 * URLs never change here. The site is indexed on this domain under these
 * paths; renaming one spends authority the site has not earned yet.
 */
import { readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { SITE } from './lib.mjs'

const FILES = { post: 'post-sitemap.xml', page: 'page-sitemap.xml', testimonial: 'testimonial-sitemap.xml', archive: 'category-sitemap.xml' }

/* Nothing disallowed on purpose: a disallowed page can never have its noindex
   read, and every page this build wants out of the index says so itself. */
const PUBLIC_ROBOTS = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap_index.xml
`

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

/** lastmod per URL from whatever Yoast sitemaps are still in OUT. */
async function previousLastmod(OUT) {
  const map = new Map()
  for (const f of Object.values(FILES)) {
    const p = join(OUT, f)
    if (!existsSync(p)) continue
    const xml = await readFile(p, 'utf8')
    for (const m of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)) {
      map.set(m[1].replace(SITE, '') || '/', m[2] || null)
    }
  }
  return map
}

export async function after(ctx) {
  const rep = ctx.report.sitemap
  const prev = await previousLastmod(ctx.OUT)
  const groups = { post: [], page: [], testimonial: [], archive: [] }

  for (const [url, p] of ctx.pages) {
    if (/noindex/i.test(p.robots)) continue
    if (p.canonical && p.canonical !== `${SITE}${url}`) continue
    // /blog/ is the one archive-shaped page that stays; it is a page, not a category.
    const kind = FILES[p.kind] && p.kind !== 'archive' ? p.kind : 'page'
    // A page whose visible content this build edited is reported as modified
    // on the day of the edit, if that is later than what WordPress recorded.
    const recorded = prev.get(url) || p.lastmod || null
    const lastmod = p.edited && (!recorded || p.edited > recorded.slice(0, 10)) ? `${p.edited}T00:00:00+00:00` : recorded
    groups[kind].push({ url, lastmod })
  }

  const children = []
  for (const [kind, file] of Object.entries(FILES)) {
    const urls = groups[kind]
    const path = join(ctx.OUT, file)
    if (!urls.length) {
      if (existsSync(path)) { await rm(path); rep[`${kind}Removed`] = true }
      continue
    }
    const body = urls.map((u) => `  <url>\n    <loc>${esc(SITE + u.url)}</loc>${u.lastmod ? `\n    <lastmod>${esc(u.lastmod)}</lastmod>` : ''}\n  </url>`).join('\n')
    await writeFile(path,
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, 'utf8')
    const latest = urls.map((u) => u.lastmod).filter(Boolean).sort().pop()
    children.push({ file, latest, count: urls.length })
    rep[kind] = urls.length
  }

  await writeFile(join(ctx.OUT, 'sitemap_index.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + children.map((c) => `  <sitemap>\n    <loc>${SITE}/${c.file}</loc>${c.latest ? `\n    <lastmod>${esc(c.latest)}</lastmod>` : ''}\n  </sitemap>`).join('\n')
    + '\n</sitemapindex>\n', 'utf8')

  // The public robots.txt. publish.mjs overwrites it with the staging one unless
  // PUBLISH_PUBLIC=1, so this is only ever served from the real domain.
  await writeFile(join(ctx.OUT, 'robots.txt'), PUBLIC_ROBOTS, 'utf8')
  rep.total = children.reduce((n, c) => n + c.count, 0)
}
