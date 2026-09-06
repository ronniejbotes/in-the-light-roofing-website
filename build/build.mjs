/**
 * Static site build.
 *
 * Reads the extracted content in content/*.json and writes one HTML file per
 * live URL into dist/. Route paths are taken from the source data, never
 * invented, so every URL that resolves today still resolves after the cutover.
 */
import { readFile, writeFile, mkdir, rm, cp, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { esc, attr, each, when, plain, clip, tidy } from './lib/html.mjs'
import { ORIGIN, abs, icon, fmtDate, isoDate, PER_PAGE } from './lib/site.mjs'
import { graph } from './lib/schema.mjs'
import { layout } from './templates/layout.mjs'
import { renderSections, setBackgroundManifest } from './templates/sections.mjs'
import { sitemaps, feed, robots } from './lib/feeds.mjs'
import { renderBlock, form, img, normaliseHref, setImageManifest, setReviewPool } from './templates/blocks.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const CONTENT = join(ROOT, 'content')

const read = async (f) => JSON.parse(await readFile(join(CONTENT, f), 'utf8'))

const written = new Map()
async function emit(route, html) {
  const rel = route === '/' ? 'index.html' : join(route.replace(/^\/|\/$/g, ''), 'index.html')
  const out = join(DIST, rel)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, tidy(html), 'utf8')
  written.set(route, rel)
}

/* -------------------------------------------------------------------------- */

async function assetManifest() {
  const mfPath = join(DIST, 'assets/build/.vite/manifest.json')
  const alt = join(DIST, 'assets/build/manifest.json')
  const p = existsSync(mfPath) ? mfPath : existsSync(alt) ? alt : null
  if (!p) {
    throw new Error(
      'Vite manifest not found. Run `npm run build:bundle` first (or `npm run build`).'
    )
  }
  const mf = JSON.parse(await readFile(p, 'utf8'))
  const entry = Object.values(mf).find((e) => e.isEntry)
  if (!entry) throw new Error('No entry chunk in the Vite manifest.')

  // With cssCodeSplit:false Vite emits the stylesheet as its own manifest entry
  // rather than hanging it off the entry chunk's `css` array, so check both.
  const css =
    entry.css?.[0] ??
    Object.values(mf).find((e) => e.file?.endsWith('.css'))?.file
  if (!css) throw new Error('No CSS asset in the Vite manifest.')

  return { js: '/assets/build/' + entry.file, css: '/assets/build/' + css }
}

/* --------------------------------------------------------------------------
   Shared partials
   -------------------------------------------------------------------------- */

const crumbs = (trail) =>
  `<nav class="breadcrumbs" aria-label="Breadcrumb"><div class="container"><ol>` +
  trail
    .map((t, i) =>
      i === trail.length - 1
        ? `<li><span aria-current="page">${esc(t.name)}</span></li>`
        : `<li><a href="${attr(t.href)}">${esc(t.name)}</a></li>`
    )
    .join('') +
  `</ol></div></nav>`

const pagehead = ({ title, lede, trail }) => `
<section class="pagehead">
  <div class="container">
    ${trail ? crumbs(trail).replace('<nav class="breadcrumbs"', '<nav class="breadcrumbs"').replace('<div class="container">', '<div>') : ''}
    <h1>${esc(title)}</h1>
    ${when(lede, () => `<p>${esc(lede)}</p>`)}
  </div>
</section>`

const postCard = (p) => `
<article class="card">
  ${when(p.featured_image?.src, () => `<div class="card__media">${img(p.featured_image, { sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px' })}</div>`)}
  <div class="card__body">
    <p class="card--meta">
      <time datetime="${attr(isoDate(p.date))}">${esc(fmtDate(p.date))}</time>
      ${when(p.categories?.[0], () => ` · <a href="${attr(p.categories[0].route)}">${esc(p.categories[0].name)}</a>`)}
    </p>
    <h3 class="card__title"><a href="${attr(p.route)}">${esc(p.title)}</a></h3>
    ${when(p.excerpt, () => `<p class="card__text">${esc(clip(p.excerpt, 140))}</p>`)}
    <span class="card__more">Read more ${icon('arrow')}</span>
  </div>
</article>`

function pagination(base, page, total) {
  if (total <= 1) return ''
  const url = (n) => (n === 1 ? base : `${base}page/${n}/`)
  const items = []
  const push = (n) =>
    items.push(
      n === page
        ? `<span aria-current="page">${n}</span>`
        : `<a href="${attr(url(n))}">${n}</a>`
    )

  if (page > 1) items.push(`<a href="${attr(url(page - 1))}" rel="prev" aria-label="Previous page">‹</a>`)
  const win = new Set([1, total, page, page - 1, page + 1])
  if (total <= 9) for (let n = 1; n <= total; n++) win.add(n)
  let last = 0
  for (const n of [...win].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)) {
    if (n - last > 1) items.push('<span class="is-gap">…</span>')
    push(n)
    last = n
  }
  if (page < total) items.push(`<a href="${attr(url(page + 1))}" rel="next" aria-label="Next page">›</a>`)

  return `<nav class="pagination" aria-label="Pagination">${items.join('')}</nav>`
}

/** "Roof Repair Archives | In the Light Roofing" -> "... | Page 2 of 5 | ..." */
function paginatedTitle(title, page, total) {
  const i = title.lastIndexOf(' | ')
  if (i === -1) return `${title} | Page ${page} of ${total}`
  return `${title.slice(0, i)} | Page ${page} of ${total}${title.slice(i)}`
}

const ctaBand = (site) => `
<section class="cta-band">
  <div class="container cta-band__inner">
    <div data-reveal="left">
      <h2>Need a roof you can stop worrying about?</h2>
      <p>Talk to a local Lehigh Valley crew. Free, no-obligation estimate.</p>
    </div>
    <div class="btn-row" data-reveal="right">
      <a class="btn btn--primary btn--lg" href="/contact/">Get a free estimate</a>
      <a class="btn btn--on-dark btn--lg" href="${attr(site.business.phone_href)}">${icon('phone')} ${esc(site.business.phone_display)}</a>
    </div>
  </div>
</section>`

/* --------------------------------------------------------------------------
   Page types
   -------------------------------------------------------------------------- */

function trailFor(kind, record, site) {
  const home = { name: 'Home', href: '/' }
  switch (kind) {
    case 'home':
      return [home]
    case 'post':
      return [home, { name: 'Blog', href: '/blog/' }, { name: record.title, href: record.route }]
    case 'service':
      return [home, { name: 'Services', href: '/services/' }, { name: record.title, href: record.route }]
    case 'area':
      return [home, { name: 'Service Area', href: '/service-area/' }, { name: record.title, href: record.route }]
    case 'testimonial':
      return [home, { name: 'Testimonial', href: '/testimonial/' }, { name: record.title, href: record.route }]
    case 'archive':
      return [home, { name: record.name || record.title, href: record.route }]
    default:
      return [home, { name: record.title, href: record.route }]
  }
}

/** Collect FAQ pairs from a page's accordion blocks, for FAQPage schema. */
function faqOf(record) {
  const out = []
  for (const s of record.sections || []) {
    for (const b of s.blocks) {
      if (b.type === 'accordion') out.push(...b.items)
    }
  }
  return out
}

/** First meaningful image on a page -- used as the LCP preload hint. */
function heroImageSrc(record) {
  for (const s of record.sections || []) {
    if (s.background) return s.background
    for (const b of s.blocks) {
      if (b.type === 'image' && !/section-line/i.test(b.src || '')) return b.src
    }
  }
  return record.featured_image?.src || null
}

/**
 * Turn that into a preload descriptor that matches the candidate the browser
 * will pick. Preloading the original when the page will actually fetch an AVIF
 * downloads the image twice.
 */
let IMAGE_MANIFEST = {}
function heroPreload(record, sizes) {
  const src = heroImageSrc(record)
  if (!src) return null
  const d = IMAGE_MANIFEST[src]
  if (!d?.avif?.length) return { href: src }
  return {
    href: d.avif[d.avif.length - 1].url,
    srcset: d.avif.map((v) => `${v.url} ${v.w}w`).join(', '),
    sizes: sizes || '100vw',
    type: 'image/avif',
  }
}

function renderPage(record, ctx) {
  const { site, assets, kind } = ctx
  const trail = trailFor(kind, record, site)
  const faq = faqOf(record)

  const body = record.sections?.length
    ? renderSections(record.sections, ctx)
    : `<section class="section"><div class="container"><div class="prose">${record.html || ''}</div></div></section>`

  const service =
    kind === 'service' && record.route !== '/services/' ? { name: record.title } : null

  return layout({
    site,
    assets,
    route: record.route,
    seo: record.seo,
    preloadImage: heroPreload(record, '100vw'),
    bodyClass: `t-${kind}`,
    schema: graph({ site, route: record.route, seo: record.seo, trail, kind, record, faq, service }),
    body:
      (kind === 'home' ? '' : crumbs(trail)) +
      body +
      (kind === 'home' ? '' : ctaBand(site)),
  })
}

function renderPost(p, ctx, related) {
  const { site, assets } = ctx
  const trail = trailFor('post', p, site)

  const body = `
${crumbs(trail)}
<article class="article">
  <div class="container">
    <div class="article__layout">
      <div>
        <header>
          <h1>${esc(p.title)}</h1>
          <div class="article__meta">
            <time datetime="${attr(isoDate(p.date))}">${esc(fmtDate(p.date))}</time>
            ${each(p.categories, (c) => `<a href="${attr(c.route)}">${esc(c.name)}</a>`)}
          </div>
        </header>
        ${when(p.featured_image?.src, () => `<div class="article__hero" data-reveal="fade">${img(p.featured_image, { eager: true, sizes: '(max-width: 1024px) 100vw, 760px' })}</div>`)}
        <div class="prose">${p.html || ''}</div>

        ${when(p.tags?.length, () => `<div class="tag-row"><span class="tag-row__label">Tagged</span><ul class="chips">${each(p.tags, (t) => `<li><a class="chip" href="${attr(t.route)}">${esc(t.name)}</a></li>`)}</ul></div>`)}

        ${when(related.length, () => `
        <section class="related">
          <h2>Related Posts</h2>
          <div class="post-grid" data-reveal-group>${each(related, (r) => postCard(r))}</div>
        </section>`)}
      </div>

      <aside class="article__aside">
        <div class="aside-card aside-card--cta">
          <h3>Get a No Cost Roof Replacement Estimate</h3>
          <p>Tell us what is going on with your roof and we will come and look at it.</p>
          ${form({ fields: [], submit: 'No Cost Estimate' }, { id: 'aside' })}
        </div>
        <div class="aside-card">
          <h3>Speak to us now</h3>
          <p><a href="${attr(site.business.phone_href)}"><strong>${esc(site.business.phone_display)}</strong></a><br>
          <a href="mailto:${attr(site.business.email)}">${esc(site.business.email)}</a></p>
          <p>${esc(site.business.street)}<br>${esc(site.business.city)}, ${esc(site.business.region)} ${esc(site.business.postal_code)}</p>
        </div>
      </aside>
    </div>
  </div>
</article>
${ctaBand(site)}`

  return layout({
    site,
    assets,
    route: p.route,
    seo: p.seo,
    preloadImage: heroPreload({ featured_image: p.featured_image },
      '(max-width: 1024px) 100vw, 760px'),
    bodyClass: 't-post',
    schema: graph({ site, route: p.route, seo: p.seo, trail, kind: 'post', record: p }),
    body,
  })
}

function renderArchive(ctx, { route, seo, title, lede, posts, page, totalPages, base, trail }) {
  const { site, assets } = ctx
  const body = `
${crumbs(trail)}
${pagehead({ title, lede, trail: null })}
<section class="section">
  <div class="container">
    ${when(page > 1, () => `<p class="archive-intro">Page ${page} of ${totalPages}</p>`)}
    <div class="post-grid" data-reveal-group>${each(posts, (p) => postCard(p))}</div>
    ${pagination(base, page, totalPages)}
  </div>
</section>
${ctaBand(site)}`

  return layout({
    site,
    assets,
    route,
    seo,
    bodyClass: 't-archive',
    schema: graph({ site, route, seo, trail, kind: 'archive', record: { title } }),
    body,
  })
}

/* -------------------------------------------------------------------------- */

async function main() {
  const t0 = Date.now()

  const [pages, posts, testimonials, categories, tags, site] = await Promise.all([
    read('pages.json'), read('posts.json'), read('testimonials.json'),
    read('categories.json'), read('tags.json'), read('site.json'),
  ])

  // Responsive derivatives (tools/images.mjs). Optional: without it the build
  // still works, it just serves the original files.
  const imageManifest =
    existsSync(join(CONTENT, 'images.json')) ? await read('images.json') : {}
  setImageManifest(imageManifest)
  setBackgroundManifest(imageManifest)
  IMAGE_MANIFEST = imageManifest

  // The Trustindex slot is filled with the site's own testimonials until that
  // third-party widget mounts. Longest-first so the cards that show are the
  // ones with something to say; clipped, with the full review one click away.
  setReviewPool(
    [...testimonials]
      .map((t) => ({
        name: t.title,
        href: t.route,
        date: fmtDate(t.date),
        text: clip(plain(t.html), 240),
      }))
      .filter((t) => t.name && t.text)
      .sort((a, b) => b.text.length - a.text.length)
  )

  // Service and area lists, derived from the real page tree (used by schema).
  site.services = pages
    .filter((p) => p.route.startsWith('/services/') && p.route !== '/services/' && !p.route.includes('campaign'))
    .map((p) => ({ name: p.title, route: p.route }))
  site.areas = pages
    .filter((p) => p.route.startsWith('/service-area/') && p.route !== '/service-area/')
    .map((p) => ({ name: p.title, route: p.route }))

  await rm(DIST, { recursive: true, force: true }).catch(() => {})
  await mkdir(DIST, { recursive: true })

  // Vite writes to .vite-out/ (outside dist, which we just wiped); copy it in.
  const stash = join(ROOT, '.vite-out')
  if (!existsSync(stash)) {
    throw new Error('.vite-out not found. Run `npm run build:bundle` first (or `npm run build`).')
  }
  await cp(stash, join(DIST, 'assets/build'), { recursive: true })

  const assets = await assetManifest()
  const ctx = { site, assets }

  const kindOf = (p) => {
    if (p.is_front) return 'home'
    if (p.route.startsWith('/services/') && p.route !== '/services/') return 'service'
    if (p.route.startsWith('/service-area/') && p.route !== '/service-area/') return 'area'
    return 'page'
  }

  /* ---- pages ---------------------------------------------------------- */
  const byRoute = new Map(pages.map((p) => [p.route, p]))
  for (const p of pages) {
    // The front page's own slug 301s to / on the live site, so it is a redirect,
    // not a page. Handled in _redirects below.
    if (p.slug === 'home-in-the-light-roofing-final-update' && p.is_front) {
      await emit('/', renderPage(p, { ...ctx, kind: 'home' }))
      continue
    }
    if (p.route === '/blog/') continue // rendered as an archive below
    await emit(p.route, renderPage(p, { ...ctx, kind: kindOf(p) }))
  }

  /* ---- posts ---------------------------------------------------------- */
  const postByRoute = new Map(posts.map((p) => [p.route, p]))
  for (const p of posts) {
    const related = (p.related || [])
      .map((r) => postByRoute.get(r.href))
      .filter(Boolean)
      .slice(0, 3)
    // Fall back to same-category posts when Link Whisper gave us nothing.
    if (related.length < 3) {
      const cat = p.categories?.[0]?.slug
      for (const q of posts) {
        if (related.length >= 3) break
        if (q.route === p.route || related.includes(q)) continue
        if (cat && q.categories?.some((c) => c.slug === cat)) related.push(q)
      }
    }
    await emit(p.route, renderPost(p, ctx, related))
  }

  /* ---- blog index + pagination ---------------------------------------- */
  const blogPage = byRoute.get('/blog/')
  const totalBlog = Math.max(1, Math.ceil(posts.length / PER_PAGE))
  for (let n = 1; n <= totalBlog; n++) {
    const route = n === 1 ? '/blog/' : `/blog/page/${n}/`
    const seo = n === 1
      ? blogPage.seo
      : { ...blogPage.seo, canonical: abs(route), og: { ...(blogPage.seo.og || {}), 'og:url': abs('/blog/') } }
    await emit(
      route,
      renderArchive(ctx, {
        route, seo,
        title: 'Blog',
        lede: blogPage?.seo?.description || '',
        posts: posts.slice((n - 1) * PER_PAGE, n * PER_PAGE),
        page: n, totalPages: totalBlog, base: '/blog/',
        trail: [{ name: 'Home', href: '/' }, { name: 'Blog', href: '/blog/' }],
      })
    )
  }

  /* ---- category + tag archives ---------------------------------------- */
  const archiveFor = async (term, kind) => {
    const list = posts.filter((p) => (p[kind === 'category' ? 'categories' : 'tags'] || [])
      .some((t) => t.slug === term.slug))
    const total = Math.max(1, Math.ceil(list.length / PER_PAGE))
    for (let n = 1; n <= total; n++) {
      const route = n === 1 ? term.route : `${term.route}page/${n}/`
      // Yoast titles paginated archives "<Term> Archives | Page N of M | <Brand>"
      // and keeps og:url on the unpaginated parent. Reproduced exactly.
      const seo = n === 1 ? term.seo : {
        ...term.seo,
        title: paginatedTitle(term.seo.title, n, total),
        ...(term.seo.canonical ? { canonical: abs(route) } : {}),
        og: { ...(term.seo.og || {}), 'og:url': abs(term.route) },
      }
      await emit(route, renderArchive(ctx, {
        route, seo,
        title: term.name,
        lede: term.description || '',
        posts: list.slice((n - 1) * PER_PAGE, n * PER_PAGE),
        page: n, totalPages: total, base: term.route,
        trail: [{ name: 'Home', href: '/' }, { name: term.name, href: term.route }],
      }))
    }
  }
  for (const c of categories) await archiveFor(c, 'category')
  for (const t of tags) await archiveFor(t, 'tag')

  /* ---- testimonials ---------------------------------------------------- */
  for (const t of testimonials) {
    const trail = trailFor('testimonial', t, site)
    await emit(t.route, layout({
      site, assets, route: t.route, seo: t.seo, bodyClass: 't-testimonial',
      schema: graph({ site, route: t.route, seo: t.seo, trail, kind: 'page', record: t }),
      body: `${crumbs(trail)}
${pagehead({ title: t.title, trail: null })}
<section class="section"><div class="container container--narrow">
  <div class="quote" data-reveal="fade"><div class="quote__text">${t.html || ''}</div><p class="quote__name">${esc(t.title)}</p></div>
</div></section>
${ctaBand(site)}`,
    }))
  }

  // /testimonial/ archive. The live site paginates it at 10 per page, so
  // /testimonial/page/2/ is a real 200 URL and must be built too.
  const tTrail = [{ name: 'Home', href: '/' }, { name: 'Testimonial', href: '/testimonial/' }]
  const tTotal = Math.max(1, Math.ceil(testimonials.length / PER_PAGE))
  for (let n = 1; n <= tTotal; n++) {
    const route = n === 1 ? '/testimonial/' : `/testimonial/page/${n}/`
    const baseTitle = 'Testimonial Archive | In the Light Roofing'
    const tSeo = {
      title: n === 1 ? baseTitle : paginatedTitle(baseTitle, n, tTotal),
      robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      canonical: abs(route),
      og: {
        'og:locale': 'en_US', 'og:type': 'website',
        'og:title': n === 1 ? baseTitle : paginatedTitle(baseTitle, n, tTotal),
        'og:url': abs('/testimonial/'), 'og:site_name': 'In the Light Roofing',
      },
    }
    const slice = testimonials.slice((n - 1) * PER_PAGE, n * PER_PAGE)
    await emit(route, layout({
      site, assets, route, seo: tSeo, bodyClass: 't-archive',
      schema: graph({ site, route, seo: tSeo, trail: tTrail, kind: 'archive', record: { title: 'Testimonial' } }),
      body: `${crumbs(tTrail)}
${pagehead({ title: 'Testimonial', lede: 'What homeowners across the Lehigh Valley say about working with us.', trail: null })}
<section class="section"><div class="container">
  <div class="grid grid--3" data-reveal-group>
    ${each(slice, (t) => `<div class="quote"><div class="quote__text">${clip(plain(t.html), 260)}</div><p class="quote__name"><a href="${attr(t.route)}">${esc(t.title)}</a></p></div>`)}
  </div>
  ${pagination('/testimonial/', n, tTotal)}
</div></section>
${ctaBand(site)}`,
    }))
  }

  /* ---- 404 ------------------------------------------------------------- */
  const nfSeo = { title: 'Page not found | In the Light Roofing', robots: 'noindex, follow' }
  await writeFile(join(DIST, '404.html'), tidy(layout({
    site, assets, route: '/404', seo: nfSeo, bodyClass: 't-404',
    body: `<section class="section notfound"><div class="container">
  <div class="notfound__code">404</div>
  <h1>We could not find that page</h1>
  <p>It may have moved. Here is where most people go next.</p>
  <div class="btn-row" style="justify-content:center;margin-top:28px">
    <a class="btn btn--primary" href="/">Back to home</a>
    <a class="btn btn--ghost" href="/services/">Our services</a>
    <a class="btn btn--ghost" href="/contact/">Contact us</a>
  </div>
  <div class="notfound__links">
    <ul class="ticks ticks--cols">
      ${each(site.services, (s) => `<li><a href="${attr(s.route)}">${esc(s.name)}</a></li>`)}
    </ul>
  </div>
</div></section>`,
  })), 'utf8')

  /* ---- sitemaps, feed, robots ------------------------------------------ */
  const maps = sitemaps({ pages, posts, testimonials, categories })
  for (const [name, xml] of Object.entries(maps)) {
    await writeFile(join(DIST, name), xml, 'utf8')
  }
  await writeFile(join(DIST, 'feed.xml'), feed(posts, site), 'utf8')
  await writeFile(join(DIST, 'robots.txt'), robots(), 'utf8')

  /* ---- static passthrough --------------------------------------------- */
  for (const dir of ['static', 'public']) {
    const src = join(ROOT, dir)
    if (existsSync(src)) await cp(src, DIST, { recursive: true })
  }

  console.log(`Rendered ${written.size} pages in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  await writeFile(join(ROOT, '.routes.json'), JSON.stringify([...written.keys()].sort(), null, 1))
  return written
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
