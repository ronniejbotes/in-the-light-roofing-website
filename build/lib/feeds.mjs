/**
 * XML sitemaps and the RSS feed.
 *
 * The sitemap set mirrors the live Yoast structure exactly -- the same index at
 * /sitemap_index.xml pointing at the same four child sitemaps with the same
 * names -- so anything already submitted in Search Console keeps working.
 *
 * Membership rule, matching the live site: only indexable URLs are listed.
 * Tag archives (noindex, follow), the noindex campaign page and the paginated
 * archives are excluded, exactly as Yoast excludes them today.
 */
import { ORIGIN, abs } from './site.mjs'

const xmlEsc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const stamp = (d) => {
  if (!d) return null
  const dt = new Date(d)
  return Number.isNaN(+dt) ? null : dt.toISOString().replace(/\.\d{3}Z$/, '+00:00')
}

const isIndexable = (rec) => !/noindex/i.test(rec?.seo?.robots || '')

function urlset(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `\t<url>\n\t\t<loc>${xmlEsc(abs(e.loc))}</loc>` +
      (e.lastmod ? `\n\t\t<lastmod>${xmlEsc(e.lastmod)}</lastmod>` : '') +
      `\n\t</url>`
  )
  .join('\n')}
</urlset>
`
}

export function sitemaps({ pages, posts, testimonials, categories }) {
  const out = {}

  const pageEntries = pages
    .filter(isIndexable)
    // The front page's own slug 301s to /, so the root is listed instead.
    .filter((p) => p.slug !== 'home-in-the-light-roofing-final-update')
    .map((p) => ({ loc: p.route, lastmod: stamp(p.modified) }))
  pageEntries.unshift({ loc: '/', lastmod: stamp(pages.find((p) => p.is_front)?.modified) })

  out['page-sitemap.xml'] = urlset(pageEntries)
  out['post-sitemap.xml'] = urlset(
    posts.filter(isIndexable).map((p) => ({ loc: p.route, lastmod: stamp(p.modified) }))
  )
  out['testimonial-sitemap.xml'] = urlset([
    { loc: '/testimonial/' },
    ...testimonials.filter(isIndexable).map((t) => ({ loc: t.route, lastmod: stamp(t.date) })),
  ])
  out['category-sitemap.xml'] = urlset(
    categories.filter(isIndexable).map((c) => ({ loc: c.route }))
  )

  const newest = (arr, key = 'modified') =>
    arr.reduce((a, b) => (a && a > (b[key] || '') ? a : b[key] || ''), '')

  const index = [
    ['post-sitemap.xml', stamp(newest(posts))],
    ['page-sitemap.xml', stamp(newest(pages))],
    ['testimonial-sitemap.xml', stamp(newest(testimonials, 'date'))],
    ['category-sitemap.xml', stamp(newest(posts))],
  ]

  out['sitemap_index.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${index
  .map(
    ([name, lm]) =>
      `\t<sitemap>\n\t\t<loc>${xmlEsc(abs('/' + name))}</loc>` +
      (lm ? `\n\t\t<lastmod>${xmlEsc(lm)}</lastmod>` : '') +
      `\n\t</sitemap>`
  )
  .join('\n')}
</sitemapindex>
`

  return out
}

export function feed(posts, site) {
  const items = posts.slice(0, 20)
  const now = new Date(items[0]?.date || Date.now()).toUTCString()
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${xmlEsc(site.business.name)}</title>
<link>${xmlEsc(ORIGIN)}/</link>
<description>Quality done right</description>
<language>en-US</language>
<lastBuildDate>${now}</lastBuildDate>
<atom:link href="${xmlEsc(abs('/feed.xml'))}" rel="self" type="application/rss+xml"/>
${items
  .map(
    (p) => `<item>
<title>${xmlEsc(p.title)}</title>
<link>${xmlEsc(abs(p.route))}</link>
<guid isPermaLink="true">${xmlEsc(abs(p.route))}</guid>
<pubDate>${new Date(p.date).toUTCString()}</pubDate>
${(p.categories || []).map((c) => `<category>${xmlEsc(c.name)}</category>`).join('')}
<description>${xmlEsc(p.excerpt || '')}</description>
</item>`
  )
  .join('\n')}
</channel>
</rss>
`
}

export function robots() {
  return `User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap_index.xml
`
}
