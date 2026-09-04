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
 * The site's own reviews, injected by the build. They fill the Trustindex slot
 * until (and unless) that third-party widget actually mounts -- see reviews().
 */
let REVIEW_POOL = []
export const setReviewPool = (list) => { REVIEW_POOL = Array.isArray(list) ? list : [] }

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

/**
 * An icon-box widget's "icon" is not always a glyph. The service-area cards use
 * town photographs, and a photograph squeezed into a 28px disc is unreadable --
 * so those are given the card's full width instead.
 *
 * Dimensions cannot separate the two here (512x512 icons, 495x484 photographs);
 * transparency can, and tools/images.mjs measures it into the manifest.
 */
function isPhotoIcon(image) {
  const d = image?.src ? IMAGES[image.src] : null
  if (!d) return false
  if (d.glyph) return false
  // Anything small enough to have been drawn as an icon stays one, flag or not.
  return Math.max(d.w || 0, d.h || 0) > 200
}

function feature(b, opts = {}) {
  const lvl = Math.min(Math.max(b.level || 3, 2), 6)
  const href = b.href ? normaliseHref(b.href) : null
  const title = b.title
    ? `<h${lvl} class="feature__title">${href ? `<a href="${attr(href)}">${esc(b.title)}</a>` : esc(b.title)}</h${lvl}>`
    : ''

  const photo = isPhotoIcon(b.image)
  const media = b.image?.src
    ? photo
      ? `<div class="card__icon card__icon--photo">` +
        `${img(b.image, { sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px' })}</div>`
      // A glyph renders in a fixed 28px box, so it never needs a large candidate.
      : `<div class="card__icon">${img(b.image, { sizes: '30px' })}</div>`
    : ''

  const cls = ['feature', 'card', opts.onDark ? 'card--glass' : 'card--flat']
    .filter(Boolean).join(' ')

  return (
    `<div class="${cls}">${photo ? media : ''}` +
    `<div class="card__body">${photo ? '' : media}${title}` +
    when(b.html, () => `<div class="feature__text">${b.html}</div>`) +
    when(href && /^\//.test(href), () =>
      `<span class="card__more">Learn more ${icon('arrow')}</span>`) +
    `</div></div>`
  )
}

/**
 * Elementor's FAQ widget on this site carries every question twice -- once for
 * the desktop layout and once for the mobile one, both rendered into the same
 * DOM. Reproducing that faithfully means a visitor reads every question twice,
 * so identical questions collapse to the first occurrence. Nothing unique is
 * dropped: only exact repeats of a question already shown.
 */
function dedupeQA(items = []) {
  const seen = new Set()
  const out = []
  for (const it of items) {
    const key = String(it.q || '').replace(/\s+/g, ' ').trim().toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

function accordion(b, idBase) {
  const items = dedupeQA(b.items)
  return (
    `<div class="accordion">` +
    each(items, (it, i) => {
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

/**
 * A gallery of one is not a grid -- and with a tall portrait original it
 * becomes a two-thousand-pixel column of nothing. One image is rendered as a
 * single framed figure with a fixed aspect, the way the source section reads.
 */
function gallery(b) {
  const images = b.images || []
  const one = images.length === 1
  const cls = `gallery${one ? ' gallery--single' : images.length === 2 ? ' gallery--pair' : ''}`
  const sizes = one
    ? '(max-width: 1210px) 100vw, 1170px'
    : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px'
  return (
    `<div class="${cls}" data-reveal-group>` +
    each(images, (im) =>
      `<a href="${attr(im.src)}" target="_blank" rel="noopener">${img(im, { sizes })}</a>`
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
  // The widget is a deferred third-party script. Until it mounts -- and for
  // every visitor where it never does -- the section shows the site's own
  // reviews rather than an empty box. reviews.js hides these if it arrives.
  const picks = REVIEW_POOL.slice(0, 3)
  return (
    `<div class="reviews-embed">` +
    `<div class="ti-widget" data-ti-widget></div>` +
    `</div>` +
    when(picks.length, () =>
      `<div class="reviews-fallback" data-reviews-fallback>` +
      `<p class="reviews-fallback__head">Selected customer reviews</p>` +
      testimonials({ items: picks }) +
      `<p class="reviews-fallback__head">` +
      `<a href="/testimonial/">Read more reviews</a></p>` +
      `</div>`)
  )
}

/**
 * Customer reviews carried over from the theme's own carousel. Rendered as
 * plain HTML quote cards -- deliberately with NO Review or aggregateRating
 * structured data attached, since self-serving review markup on a business's
 * own pages makes the whole domain ineligible for review rich results.
 */
function testimonials(b) {
  const star =
    `<svg viewBox="0 0 24 24" aria-hidden="true" class="stars__i">` +
    `<path d="m12 17.3-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7z"/></svg>`
  return (
    `<div class="grid grid--3" data-reveal-group>` +
    each(b.items, (t) =>
      `<figure class="quote">` +
      when(t.stars > 0, () =>
        `<div class="stars" role="img" aria-label="${attr(t.stars)} out of 5 stars">` +
        star.repeat(Math.min(t.stars, 5)) + `</div>`) +
      `<blockquote class="quote__text">${esc(t.text)}</blockquote>` +
      `<figcaption class="quote__name">` +
      (t.href ? `<a href="${attr(t.href)}">${esc(t.name)}</a>` : esc(t.name)) +
      when(t.date || t.source, () =>
        `<span class="quote__meta">${esc([t.source, t.date].filter(Boolean).join(' · '))}</span>`) +
      `</figcaption></figure>`
    ) +
    `</div>`
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

/**
 * The homepage carousel is six slides that each contain the same "Contact Us
 * Now" heading -- on the live site their backgrounds and rotation make them a
 * decorative band, and that styling did not survive extraction. Paging through
 * six identical slides is pointless, so a carousel whose every slide is a lone
 * heading renders as a moving band of CTA pills instead. Every slide's text and
 * link is preserved; only the control it sits in changes.
 */
export function isCtaTicker(b) {
  const slides = b.slides || []
  return slides.length >= 3 &&
    slides.every((s) => s.length === 1 && s[0].type === 'heading' && s[0].text)
}

function marquee(b) {
  const items = (b.slides || []).map((s) => s[0])
  const pill = (it) => {
    const inner = `${esc(it.text)}${icon('arrow')}`
    return it.href
      ? `<a class="marquee__item" href="${attr(normaliseHref(it.href))}">${inner}</a>`
      : `<span class="marquee__item">${inner}</span>`
  }
  // The track is rendered twice so the translate loop has no visible seam. The
  // copy is inert: aria-hidden, and its links are out of the tab order.
  const track = `<div class="marquee__track">${each(items, pill)}</div>`
  const clone = track
    .replace('<div class="marquee__track">', '<div class="marquee__track" aria-hidden="true">')
    .replace(/<a class="marquee__item"/g, '<a class="marquee__item" tabindex="-1"')
  return `<div class="marquee">${track}${clone}</div>`
}

function carousel(b, idBase) {
  if (isCtaTicker(b)) return marquee(b)
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
    case 'image':
      if (isRule(b)) return '<div class="rule"></div>'
      // A small image is a glyph (rating star, badge), not a content image --
      // wrapping it in .media would stretch it to the full container width.
      if (b.width && b.width <= 120) {
        return `<span class="glyph">${img(b, { ...opts, sizes: `${b.width}px` })}</span>`
      }
      return `<div class="media">${img(b, opts)}</div>`
    case 'button':    return button(b, opts)
    case 'feature':   return feature(b, opts)
    case 'list':      return list(b)
    case 'accordion': return accordion(b, id)
    case 'gallery':   return gallery(b)
    case 'video':     return video(b)
    case 'map':       return map(b)
    case 'form':      return form(b, { id })
    case 'glyphs':
      return `<span class="glyph-row">` +
        each(b.items, (g, k) => renderBlock(g, `${id}-g${k}`, opts)) + `</span>`
    case 'reviews':   return reviews()
    case 'testimonials': return testimonials(b)
    case 'carousel':  return carousel(b, id)
    case 'postgrid':  return opts.postgrid || ''
    default:          return ''
  }
}

export { isRule, reveal }
