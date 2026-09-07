/**
 * Sitemaps and the live robots.txt, generated from what was actually published.
 *
 * The mirror carries Yoast's four sitemaps as captured. They list URLs by what
 * WordPress thought was public, not by what this build makes indexable: the
 * category archives that all render the same eighteen posts are in there, the
 * fixed asphalt-shingle service page is not (Yoast drops any page carrying a
 * canonical override, which is how a nav-linked money page ended up in no
 * sitemap at all), and every entry names the live domain even though the file
 * was captured from it.
 *
 * So the four files are rewritten from the pages this pass just finished
 * processing, keeping the same filenames -- Search Console already has
 * sitemap_index.xml submitted, and the same four children keep that
 * submission valid. A URL is listed only if it is indexable (no noindex) and
 * self-canonical; anything declared a duplicate falls out by itself. lastmod is
 * carried over from Yoast's files where it had one, because inventing a
 * modification date tells Google every page changed today.
 *
 * URLs never change here. The site is indexed on this domain under these
 * paths; renaming one spends authority the site has not earned yet.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { SITE } from './lib.mjs'

const FILES = { post: 'post-sitemap.xml', page: 'page-sitemap.xml', testimonial: 'testimonial-sitemap.xml', archive: 'category-sitemap.xml' }

const PUBLIC_ROBOTS = `User-agent: *
Allow: /
Disallow: /_static/

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
    const kind = FILES[p.kind] ? p.kind : 'page'
    groups[kind].push({ url, lastmod: prev.get(url) || null })
  }

  const children = []
  for (const [kind, file] of Object.entries(FILES)) {
    const urls = groups[kind]
    // Keep every child file, even if empty: Search Console has the index and its
    // four children on record, and a missing child reads as "couldn't fetch".
    const body = urls.map((u) => `  <url>\n    <loc>${esc(SITE + u.url)}</loc>${u.lastmod ? `\n    <lastmod>${esc(u.lastmod)}</lastmod>` : ''}\n  </url>`).join('\n')
    await writeFile(join(ctx.OUT, file),
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
