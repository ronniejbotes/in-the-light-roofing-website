import { esc, attr, each, when, plain } from '../lib/html.mjs'
import { icon } from '../lib/site.mjs'

/* ---------------------------------------------------------------------------
   Elementor popup CTAs.

   The live buttons open Elementor popups via an encoded `#elementor-action=…`
   href. Those popups are all quote forms, so in the rebuild they point at the
   contact page instead of a dead fragment. Recorded here so the mapping is
   obvious rather than buried in a regex.
   --------------------------------------------------------------------------- */
/** Apply href normalisation inside already-extracted rich HTML. */
export const fixLinks = (html) =>
  String(html ?? '').replace(/href="([^"]*)"/g, (m, h) => `href="${normaliseHref(h)}"`)

export function normaliseHref(href) {
  if (!href) return '/contact/'
  if (href.startsWith('#elementor-action')) return '/contact/'
  if (href === '/contact') return '/contact/'
  return href
}

/** Elementor's own entrance animations map onto our reveal directions. */
const REVEAL = { fadeIn: 'fade', fadeInUp: 'up', fadeInDown: 'fade', fadeInLeft: 'left', fadeInRight: 'right' }
const reveal = (b) => ` data-reveal="${REVEAL[b?.anim] || 'up'}"`

/** Decorative rules the live site draws with a section-line image. We render
 *  the same visual as a styled element rather than shipping an image request. */
const isRule = (b) =>
  b.type === 'image' && /section-line|sec-line|divider/i.test(b.src || '')

/**
 * Images that 404 on the live site today. Rendering them would show a broken
 * image to every visitor, so the <img> is skipped. The file itself is still
 * missing upstream -- see NOTES.md, the client needs to re-upload it.
 */
const MISSING = new Set(['/wp-content/uploads/2024/10/resi-17.webp'])

/**
 * Responsive derivatives, keyed by the ORIGINAL path (see tools/images.mjs).
 * Injected by the build so this module stays free of filesystem access.
 */
let IMAGES = {}
export const setImageManifest = (m) => { IMAGES = m || {} }

/**
 * Render an image.
 *
 * The <img src> is always the original, untouched URL, so anything that has
 * already indexed or hotlinked it keeps working. AVIF and WebP derivatives are
 * offered ahead of it via <source>, which is what browsers actually download.
 * Intrinsic width/height always come from the real file to reserve layout space.
 */
const img = (o, opts = {}) => {
  if (!o?.src || MISSING.has(o.src)) return ''
  const {
    eager = false,
    cls = '',
    // Default assumes a content image inside the 1170px container. Callers
    // that know better (cards, icons, split columns) pass their own.
    sizes = '(max-width: 1210px) 100vw, 1170px',
  } = opts

  const d = IMAGES[o.src]
  const w = o.width || d?.w
  const h = o.height || d?.h

  const core =
    `<img src="${attr(o.src)}" alt="${attr(o.alt || '')}"` +
    (w ? ` width="${attr(w)}"` : '') +
    (h ? ` height="${attr(h)}"` : '') +
    (cls ? ` class="${attr(cls)}"` : '') +
    (d ? ` sizes="${attr(sizes)}"` : '') +
    (eager
      ? ' fetchpriority="high" decoding="async"'
      : ' loading="lazy" decoding="async"') +
    `>`

  if (!d || (!d.avif?.length && !d.webp?.length)) return core

  const srcset = (list) => list.map((v) => `${v.url} ${v.w}w`).join(', ')
  return (
    `<picture>` +
    (d.avif?.length ? `<source type="image/avif" srcset="${attr(srcset(d.avif))}" sizes="${attr(sizes)}">` : '') +
    (d.webp?.length ? `<source type="image/webp" srcset="${attr(srcset(d.webp))}" sizes="${attr(sizes)}">` : '') +
    core +
    `</picture>`
  )
}

export { img }

/* ---------------------------------------------------------------------------
   Individual blocks
   --------------------------------------------------------------------------- */

function heading(b) {
  const lvl = Math.min(Math.max(b.level || 2, 1), 6)
  const inner = b.lead
    ? `<span class="lead">${esc(b.lead)}</span>${b.rest ? ' ' + esc(b.rest) : ''}`
    : esc(b.text)
  const h = `<h${lvl}${b.lead ? ' class="dch"' : ''}>${b.href ? `<a href="${attr(normaliseHref(b.href))}">${inner}</a>` : inner}</h${lvl}>`
  return b.sub ? `${h}<p class="lede">${esc(b.sub)}</p>` : h
}

function feature(b) {
  const lvl = Math.min(Math.max(b.level || 3, 2), 6)
  const href = b.href ? normaliseHref(b.href) : null
  const title = b.title
    ? `<h${lvl} class="feature__title">${href ? `<a href="${attr(href)}">${esc(b.title)}</a>` : esc(b.title)}</h${lvl}>`
    : ''
  // The icon renders in a fixed 30px box, so it never needs a large candidate.
  const media = b.image?.src
    ? `<div class="card__icon">${img(b.image, { sizes: '30px' })}</div>`
    : ''
  return (
    `<div class="feature card card--flat">` +
    `<div class="card__body">${media}${title}` +
    when(b.html, () => `<div class="feature__text">${b.html}</div>`) +
    when(href && /^\//.test(href), () =>
      `<span class="card__more">Learn more ${icon('arrow')}</span>`) +
    `</div></div>`
  )
}

function accordion(b, idBase) {
  return (
    `<div class="accordion">` +
    each(b.items, (it, i) => {
      const id = `${idBase}-p${i}`
      return (
        `<div class="accordion__item"${i === 0 ? ' data-open' : ''}>` +
        `<h3 style="margin:0">` +
        `<button class="accordion__btn" type="button" aria-expanded="true" aria-controls="${id}">` +
        `<span>${esc(it.q)}</span><span class="accordion__icon" aria-hidden="true"></span>` +
        `</button></h3>` +
        `<div class="accordion__panel" id="${id}"><div><div class="accordion__inner">${it.a}</div></div></div>` +
        `</div>`
      )
    }) +
    `</div>`
  )
}

function gallery(b) {
  return (
    `<div class="gallery"${' data-reveal-group'}>` +
    each(b.images, (im) =>
      `<a href="${attr(im.src)}" target="_blank" rel="noopener">` +
      `${img(im, { sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px' })}</a>`
    ) +
    `</div>`
  )
}

function video(b) {
  if (b.youtube_id) {
    // Poster frames are self-hosted (tools/fetch-posters.mjs) so the facade
    // paints without a third-party request.
    const id = b.youtube_id
    const custom = b.poster?.src
    const poster = custom || `/assets/video/${id}.jpg`
    const sources = custom
      ? ''
      : `<source type="image/avif" srcset="/assets/video/${attr(id)}.avif">` +
        `<source type="image/webp" srcset="/assets/video/${attr(id)}.webp">`
    return (
      `<button class="yt" type="button" data-yt="${attr(id)}" ` +
      `data-yt-title="${attr(b.title || 'Video')}" aria-label="Play video">` +
      `<picture>${sources}` +
      `<img src="${attr(poster)}" alt="" loading="lazy" decoding="async" width="880" height="495">` +
      `</picture>` +
      `<span class="yt__play">${icon('play')}</span></button>`
    )
  }
  return `<div class="embed"><iframe src="${attr(b.src)}" title="${attr(b.title || 'Video')}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
}

function map(b) {
  return `<div class="embed embed--map"><iframe src="${attr(b.src)}" title="${attr(b.title || 'Map')}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>`
}

/** Quote form. Field names/placeholders come from the live Forminator form. */
export function form(b, opts = {}) {
  const fields = b.fields?.length
    ? b.fields
    : [
        { name: 'name-1', type: 'text', placeholder: 'Name' },
        { name: 'phone-1', type: 'text', placeholder: 'Phone' },
        { name: 'email-1', type: 'email', placeholder: 'Email' },
        { name: 'textarea-1', type: 'textarea', placeholder: 'How Can We Help' },
      ]

  // Normalise Forminator's suffixed names to plain ones for the new handler.
  const norm = (n) => n.replace(/-\d+$/, '').replace(/^textarea$/, 'message')

  return (
    `<form class="form" data-itlr-form data-redirect="/thank-you/" ` +
    `data-fallback-email="info@inthelightroofing.com" novalidate>` +
    each(fields, (f) => {
      const name = norm(f.name)
      const label = f.placeholder || name
      const id = `f-${opts.id || 'x'}-${name}`
      if (f.type === 'textarea') {
        return `<div class="form__field"><label class="form__label" for="${id}">${esc(label)}</label>` +
          `<textarea id="${id}" name="${attr(name)}" placeholder="${attr(f.placeholder || '')}" rows="4"></textarea></div>`
      }
      if (f.type === 'select') {
        return `<div class="form__field"><label class="form__label" for="${id}">${esc(label)}</label>` +
          `<select id="${id}" name="${attr(name)}">` +
          each(f.options, (o) =>
            `<option value="${attr(o.value)}"${o.value ? '' : ' selected'}>${esc(o.label)}</option>`) +
          `</select></div>`
      }
      return `<div class="form__field"><label class="form__label" for="${id}">${esc(label)}</label>` +
        `<input id="${id}" type="${attr(f.type === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text')}" ` +
        `name="${attr(name)}" placeholder="${attr(f.placeholder || '')}"` +
        `${name === 'name' ? ' required' : ''} autocomplete="${attr(name === 'name' ? 'name' : name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'on')}"></div>`
    }) +
    `<input class="form__hp" type="text" name="company_website" tabindex="-1" autocomplete="off" aria-hidden="true">` +
    `<button class="btn btn--primary btn--block" type="submit">${esc(b.submit || 'No Cost Estimate')}</button>` +
    `<p class="form__status" role="status" aria-live="polite"></p>` +
    `</form>`
  )
}

/** Trustindex reviews. The widget script renders into this container; the text
 *  it shows (review count, ratings) is fetched live and is deliberately not
 *  baked into the HTML, so it can never go stale. */
function reviews() {
  return (
    `<div class="reviews-embed">` +
    `<div class="ti-widget" data-ti-widget></div>` +
    `<noscript><p class="reviews-embed__fallback">` +
    `Our Google and Facebook reviews load here. ` +
    `<a href="https://www.google.com/search?q=In+The+Light+Roofing+Allentown" target="_blank" rel="noopener">Read them on Google</a>.` +
    `</p></noscript></div>`
  )
}

function list(b) {
  return `<ul class="ticks${b.items.length > 5 ? ' ticks--cols' : ''}">` +
    each(b.items, (i) =>
      `<li>${i.href ? `<a href="${attr(normaliseHref(i.href))}">${esc(i.text)}</a>` : esc(i.text)}</li>`
    ) + `</ul>`
}

/**
 * Only the first CTA in a row is the primary action; the rest are secondary so
 * the eye has somewhere to land. `onDark` picks the outline treatment that
 * reads on a photo or dark band.
 */
function button(b, opts = {}) {
  const variant = opts.secondary
    ? (opts.onDark ? 'btn--on-dark' : 'btn--ghost')
    : 'btn--primary'
  return `<a class="btn ${variant}" href="${attr(normaliseHref(b.href))}">${esc(b.label)}</a>`
}

function carousel(b, idBase) {
  return (
    `<div class="carousel" data-carousel>` +
    `<div class="carousel__track">` +
    each(b.slides, (slide, i) =>
      `<div>${each(slide, (sb, k) => renderBlock(sb, `${idBase}-s${i}-${k}`, { inCarousel: true }))}</div>`
    ) +
    `</div>` +
    `<div class="carousel__nav">` +
    `<button class="carousel__btn" type="button" data-carousel-prev aria-label="Previous">${icon('chevron')}</button>` +
    `<button class="carousel__btn" type="button" data-carousel-next aria-label="Next">${icon('chevron')}</button>` +
    `</div></div>`
  )
}

/* ---------------------------------------------------------------------------
   Dispatcher
   --------------------------------------------------------------------------- */

export function renderBlock(b, id, opts = {}) {
  switch (b.type) {
    case 'heading':   return heading(b)
    case 'richtext':  return `<div class="rich">${fixLinks(b.html)}</div>`
    case 'image':     return isRule(b) ? '<div class="rule"></div>' : `<div class="media">${img(b, opts)}</div>`
    case 'button':    return button(b, opts)
    case 'feature':   return feature(b)
    case 'list':      return list(b)
    case 'accordion': return accordion(b, id)
    case 'gallery':   return gallery(b)
    case 'video':     return video(b)
    case 'map':       return map(b)
    case 'form':      return form(b, { id })
    case 'reviews':   return reviews()
    case 'carousel':  return carousel(b, id)
    case 'postgrid':  return opts.postgrid || ''
    default:          return ''
  }
}

export { isRule, reveal }
