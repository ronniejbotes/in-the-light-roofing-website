import { esc, attr, each, when, ld, attrs } from '../lib/html.mjs'
import { ORIGIN, abs, icon, socialIcon, socialName } from '../lib/site.mjs'

/* ---------------------------------------------------------------------------
   <head>

   Title, description, robots, canonical, og:* and twitter:* are written back
   exactly as the live site emits them (captured from the rendered HTML, which
   the SEO baseline confirmed matches the Yoast REST values byte-for-byte).
   Nothing here is regenerated or "improved" -- those signals are the contract.
   --------------------------------------------------------------------------- */

/**
 * LCP preload.
 *
 * It must describe the SAME candidate the browser will actually choose, or the
 * preload fetches a second, larger copy of the image. When a derivative exists
 * we preload the AVIF srcset with its type, so a browser without AVIF support
 * ignores the hint entirely rather than downloading the wrong file.
 */
function preloadLink(p) {
  if (typeof p === 'string') {
    return `<link rel="preload" as="image" href="${attr(p)}" fetchpriority="high">`
  }
  if (!p?.href) return ''
  return (
    `<link rel="preload" as="image" href="${attr(p.href)}"` +
    (p.srcset ? ` imagesrcset="${attr(p.srcset)}"` : '') +
    (p.sizes ? ` imagesizes="${attr(p.sizes)}"` : '') +
    (p.type ? ` type="${attr(p.type)}"` : '') +
    ` fetchpriority="high">`
  )
}

function head(ctx) {
  const { seo = {}, assets, site } = ctx
  const og = seo.og || {}
  const tw = seo.twitter || {}

  const preloadImg = ctx.preloadImage

  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(seo.title || site.business.name)}</title>
${when(seo.description, () => `<meta name="description" content="${attr(seo.description)}">`)}
<meta name="robots" content="${attr(seo.robots || 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1')}">
${when(seo.canonical, () => `<link rel="canonical" href="${attr(seo.canonical)}">`)}
${each(Object.entries(og), ([k, v]) => `<meta property="${attr(k)}" content="${attr(v)}">`)}
${each(Object.entries(tw), ([k, v]) => `<meta name="${attr(k)}" content="${attr(v)}">`)}
<link rel="preconnect" href="https://cdn.trustindex.io" crossorigin>
<link rel="icon" href="/wp-content/uploads/2023/12/cropped-header-logo-32x32.png" sizes="32x32">
<link rel="icon" href="/wp-content/uploads/2023/12/cropped-header-logo-192x192.png" sizes="192x192">
<link rel="apple-touch-icon" href="/wp-content/uploads/2023/12/cropped-header-logo-180x180.png">
<meta name="theme-color" content="${attr(ctx.themeColor || '#14161e')}">
<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/exo2-latin.woff2" crossorigin>
${when(preloadImg, () => preloadLink(preloadImg))}
<link rel="stylesheet" href="${attr(assets.css)}">
<link rel="alternate" type="application/rss+xml" title="${attr(site.business.name)} &raquo; Feed" href="/feed.xml">
${when(ctx.schema, () => `<script type="application/ld+json">${ld(ctx.schema)}</script>`)}
<script type="module" src="${attr(assets.js)}"></script>`
}

/* ---------------------------------------------------------------------------
   Header
   --------------------------------------------------------------------------- */

const caret = `<svg class="nav__caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.4 5.6 9l1.4-1.4 5 5 5-5L18.4 9z"/></svg>`

function navItem(item, current, depth = 0) {
  const kids = item.children || []
  const isCurrent = item.href === current
  const link =
    `<a class="nav__link" href="${attr(item.href)}"${isCurrent ? ' aria-current="page"' : ''}>` +
    `${esc(item.label)}${kids.length ? caret : ''}</a>`

  if (!kids.length) return `<li class="nav__item">${link}</li>`

  return (
    `<li class="nav__item">${link}` +
    `<ul class="nav__sub">${each(kids, (k) => navItem(k, current, depth + 1))}</ul>` +
    `</li>`
  )
}

function mobileItem(item, current, path = '0') {
  const kids = item.children || []
  const id = `mm-${path}`
  const isCurrent = item.href === current

  if (!kids.length) {
    return `<li><a href="${attr(item.href)}"${isCurrent ? ' aria-current="page"' : ''}>${esc(item.label)}</a></li>`
  }

  return (
    `<li>` +
    `<div class="mobile-menu__row">` +
    `<a href="${attr(item.href)}"${isCurrent ? ' aria-current="page"' : ''}>${esc(item.label)}</a>` +
    `<button class="mobile-menu__toggle" type="button" aria-expanded="false" aria-controls="${id}" ` +
    `aria-label="Show ${attr(item.label)} submenu">${icon('chevron')}</button>` +
    `</div>` +
    `<div class="mobile-menu__sub" id="${id}"><div><ul>` +
    each(kids, (k, i) => mobileItem(k, current, `${path}-${i}`)) +
    `</ul></div></div>` +
    `</li>`
  )
}

function header(ctx) {
  const { site, route } = ctx
  const b = site.business
  const nav = site.header.nav || []
  const logo = site.logos.header || {}
  const socials = site.footer.socials || []

  // The header trust badges carry review counts that the live site hard-codes.
  // They are reproduced as written; see NOTES.md -- these need a real source or
  // they drift out of date.
  const badges = (site.header.badges || []).filter(
    (x) => x.image && !/@|Phone Number/i.test(x.text)
  )

  return `<div class="topbar">
  <div class="container topbar__inner">
    <div class="topbar__badges">
      ${each(badges, (x) => `<span class="topbar__badge">${when(x.image?.src, () => `<img src="${attr(x.image.src)}" alt="${attr(x.image.alt || '')}" width="78" height="14" loading="eager" decoding="async">`)}${esc(x.text)}</span>`)}
    </div>
    <div class="topbar__links">
      <a href="mailto:${attr(b.email)}">${icon('mail')} ${esc(b.email)}</a>
      <span class="topbar__socials">
        ${each(socials, (u) => `<a href="${attr(u)}" target="_blank" rel="noopener" aria-label="${attr(socialName(u))}">${icon(socialIcon(u))}</a>`)}
      </span>
    </div>
  </div>
</div>

<header class="header">
  <div class="container header__inner">
    <a class="header__logo" href="/" aria-label="${attr(b.name)} — home">
      <img src="${attr(logo.src || '')}" alt="${attr(b.name)}" width="${attr(logo.width || 562)}" height="${attr(logo.height || 225)}" fetchpriority="high" decoding="async">
    </a>

    <nav class="nav" aria-label="Primary">
      <ul class="nav__list">${each(nav, (i) => navItem(i, route))}</ul>
    </nav>

    <div class="header__actions">
      <a class="header__phone" href="${attr(b.phone_href)}">
        ${icon('phone')}<span><small>Call us today</small>${esc(b.phone_display)}</span>
      </a>
      <a class="btn btn--primary" href="/contact/">Free Estimate</a>
      <button class="burger" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Open menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>

<div class="mobile-menu" id="mobile-menu" aria-hidden="true">
  <div class="mobile-menu__head">
    <img src="${attr(logo.src || '')}" alt="${attr(b.name)}" width="160" height="64" decoding="async">
    <button class="burger" type="button" data-menu-close aria-expanded="true" aria-label="Close menu">
      <span></span><span></span><span></span>
    </button>
  </div>
  <div class="mobile-menu__body">
    <ul>${each(nav, (i, n) => mobileItem(i, route, String(n)))}</ul>
    <div class="mobile-menu__cta">
      <a class="btn btn--primary btn--block" href="/contact/">Get a free estimate</a>
      <a class="btn btn--ghost btn--block" href="${attr(b.phone_href)}">${icon('phone')} ${esc(b.phone_display)}</a>
    </div>
  </div>
</div>`
}

/* ---------------------------------------------------------------------------
   Footer
   --------------------------------------------------------------------------- */

function footer(ctx) {
  const { site } = ctx
  const b = site.business
  const f = site.footer
  const logo = site.logos.footer || site.logos.header || {}

  return `<footer class="footer">
  <div class="container">
    <div class="footer__top">
      <div>
        <div class="footer__logo">
          <img src="${attr(logo.src || '')}" alt="${attr(b.name)}" width="200" height="80" loading="lazy" decoding="async">
        </div>
        <p class="footer__about">${esc(f.about || '')}</p>
        <div class="footer__socials">
          ${each(f.socials, (u) => `<a href="${attr(u)}" target="_blank" rel="noopener" aria-label="${attr(socialName(u))}">${icon(socialIcon(u))}</a>`)}
        </div>
      </div>

      ${each(f.columns, (col) => `<div>
        <h2 class="footer__heading">${esc(col.heading)}</h2>
        <div class="footer__rule"></div>
        <ul class="footer__list">${each(col.items, (i) => `<li><a href="${attr(i.href)}">${esc(i.label)}</a></li>`)}</ul>
      </div>`)}

      <div>
        <h2 class="footer__heading">Contact info</h2>
        <div class="footer__rule"></div>
        <div class="footer__contact">
          <div class="footer__contact-item">${icon('pin')}<div><strong>Address</strong>${esc(b.street)}<br>${esc(b.city)}, ${esc(b.region)} ${esc(b.postal_code)}</div></div>
          <div class="footer__contact-item">${icon('phone')}<div><strong>Phone</strong><a href="${attr(b.phone_href)}">${esc(b.phone_display)}</a></div></div>
          <div class="footer__contact-item">${icon('mail')}<div><strong>Email</strong><a href="mailto:${attr(b.email)}">${esc(b.email)}</a></div></div>
        </div>
        <p><strong>Hablamos español</strong></p>
        <a class="btn btn--primary" href="/contact/">No Cost Project Estimate</a>
      </div>
    </div>

    <div class="footer__bottom">
      <span>${esc(f.copyright || `Copyright © ${new Date().getFullYear()}. All Rights Reserved.`)}</span>
      <span class="footer__bottom-links">
        <a href="/sitemap_index.xml">Sitemap</a>
        <a href="/blog/">Blog</a>
        <a href="/contact/">Contact</a>
      </span>
    </div>
  </div>
</footer>

<div class="callbar">
  <a href="${attr(b.phone_href)}" class="is-primary">${icon('phone')} Call now</a>
  <a href="/contact/">${icon('mail')} Free estimate</a>
</div>

<button class="to-top" type="button" aria-label="Back to top">${icon('up')}</button>`
}

/* ---------------------------------------------------------------------------
   Document
   --------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   Third-party tags.

   Carried over from the live site with the same ids. All of them load after
   the page is interactive so none of them sits on the critical path -- the
   WordPress site loaded several of these render-blocking.
   --------------------------------------------------------------------------- */

function thirdParty(site) {
  const tp = site.third_party || {}
  const tags = []

  // Analytics and call tracking must fire even for a visitor who never
  // interacts, so they load on a short timer or first interaction.
  for (const id of tp.gtm || []) {
    tags.push({
      id: `gtm-${id}`, when: 'idle',
      src: `https://www.googletagmanager.com/gtm.js?id=${id}`,
      before:
        "window.dataLayer=window.dataLayer||[];" +
        "window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});",
    })
  }

  // CallRail does dynamic number insertion for the paid campaigns.
  if (tp.callrail?.company) {
    tags.push({
      id: 'callrail', when: 'idle',
      src: `https://cdn.callrail.com/companies/${tp.callrail.company}/` +
           `${tp.callrail.path || 'wp-0-5-3'}/swap.js`,
    })
  }

  if (tp.clickcease) {
    tags.push({ id: 'clickcease', when: 'idle', src: 'https://www.clickcease.com/monitor/stat.js' })
  }

  // The reviews widget only matters once its section is on screen.
  if (tp.trustindex) {
    tags.push({
      id: 'trustindex', when: 'visible', selector: '.ti-widget',
      src: 'https://cdn.trustindex.io/loader.js',
    })
  }

  // The chat widget is by far the heaviest thing on the page (~1.6 MB), and
  // nobody needs it before they reach for it.
  if (tp.fastbots_bot_id) {
    tags.push({
      id: 'fastbots', when: 'interaction',
      src: 'https://app.fastbots.ai/embed.js',
      attrs: { 'data-bot-id': tp.fastbots_bot_id },
    })
  }

  if (tp.cleantalk_enabled && tp.cleantalk?.host) {
    tags.push({
      id: 'cleantalk', when: 'interaction',
      src: `https://${tp.cleantalk.host}/i/${tp.cleantalk.id}.js`,
    })
  }

  if (!tags.length) return ''
  return `<script>window.__itlrTags=${ld(tags)}<\/script>`
}

export function layout(ctx) {
  const { site } = ctx
  const gtm = (site.third_party?.gtm || [])[0]

  return `<!doctype html>
<html lang="en-US">
<head>
${head(ctx)}
</head>
<body class="${attr(ctx.bodyClass || '')}">
${when(gtm, () => `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${attr(gtm)}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`)}
<a class="skip-link" href="#main">Skip to content</a>
<div class="page">
${header(ctx)}
<main id="main">
${ctx.body}
</main>
${footer(ctx)}
</div>
${thirdParty(site)}
</body>
</html>`
}
