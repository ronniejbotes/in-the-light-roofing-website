/**
 * Client photographs that replace or add to what the mirror carries.
 *
 * Supplied by the client on 2 October 2026, three shots from one session at
 * the shop (871 N Fenwick St): the full crew sitting on the wall under the
 * "Quality done Right" mural, the crew standing with the van, and the van on
 * its own. Sized copies live in overrides/assets/photos/ (served at
 * /_assets/photos/), made with sharp at quality 78 like every other derivative
 * in this repo; the originals were 1440x1080, so nothing here is enlarged.
 *
 *   1. Homepage, the big crew panel under "Experienced Roofing Experts"
 *      (Elementor image widgets ee0f085 and e3f1ab4). The old group photo, SEMI8066, six
 *      people in front of a flag, no longer shows the whole crew. The new one
 *      is landscape where the old was portrait, but the widget renders
 *      object-fit: cover in a box of roughly 1090x900 on desktop, so a 4:3
 *      photo fills it with only a sliver trimmed off each side.
 *   2. About Us, a new two-photo band (crew with the van, then the van)
 *      between Bryson's story and "Contact Our Roofing Team". Styled in
 *      overrides/overrides.css under .itlr-crew-photos.
 *   3. /what-to-expect-during-a-full-roof-replacement-in-allentown/, the
 *      post's featured image (7 October 2026). It was a stock photo preview
 *      with the library's watermark repeated across the frame. It becomes
 *      resi-14, one of the company's own job photographs already on the site
 *      (the Coplay page and the cool roof post show it): two roofers partway
 *      through a tear-off. It is the same 1024x552 with the same 300 and 768
 *      wide copies, so every width, height and srcset entry still holds.
 *      Every reference moves, in both forms the page writes it: plain in the
 *      <img>, its srcset and og:image, slash-escaped in the JSON-LD's
 *      thumbnailUrl, url and contentUrl. The alt and the ImageObject caption
 *      were another post's title; both now say what the photograph shows.
 *      build/publish.mjs leaves the old files out of the build.
 *
 * Done here rather than in overrides.js so the photographs are in the HTML a
 * crawler reads, with real alt text, instead of being painted in by script.
 */
import { escapeAttr, getYoastGraph, replaceJsonLd, SITE } from './lib.mjs'

const P = '/_assets/photos/'

const TEAM_ALT = 'The In The Light Roofing crew sitting on the wall outside the shop in Allentown, under the company mural'

function teamImg() {
  return `<img loading="lazy" decoding="async" width="1440" height="1080"`
    + ` src="${P}crew-at-the-shop-1024.webp"`
    + ` srcset="${P}crew-at-the-shop-768.webp 768w, ${P}crew-at-the-shop-1024.webp 1024w, ${P}crew-at-the-shop-1440.webp 1440w"`
    // Same rendered widths the old photo was measured at: 1090 px at 1440,
    // 1401 at 1920, 90 % of the viewport on phones.
    + ` sizes="(max-width: 767px) 90vw, (max-width: 1024px) 100vw, (max-width: 1500px) 1090px, 1440px"`
    + ` class="attachment-full size-full itlr-crew-photo" alt="${escapeAttr(TEAM_ALT)}" />`
}

const BAND_PHOTOS = [
  ['crew-with-van', 'The In The Light Roofing crew standing in front of one of the company vans'],
  ['company-van', 'An In The Light Roofing van with ladders on the roof rack, parked outside the shop'],
]

function band() {
  const figs = BAND_PHOTOS.map(([name, alt]) =>
    `<figure class="itlr-crew-photos__item">`
    + `<img loading="lazy" decoding="async" width="1080" height="810"`
    + ` src="${P}${name}-1080.webp"`
    + ` srcset="${P}${name}-768.webp 768w, ${P}${name}-1080.webp 1080w"`
    + ` sizes="(max-width: 767px) 92vw, 560px"`
    + ` alt="${escapeAttr(alt)}" /></figure>`).join('')
  return `<section class="itlr-crew-photos" aria-label="Our crew and vans">`
    + `<div class="itlr-crew-photos__inner">${figs}</div></section>`
}

/* Item 3: a post's featured image, swapped by path. The paths stop before the
   extension so the 300 and 768 wide copies follow the full-size file. */
const FEATURED = {
  '/what-to-expect-during-a-full-roof-replacement-in-allentown/': {
    from: '/assets/2024/11/What-to-Expect-During-a-Full-Roof-Replacement-in-Allentown',
    to: '/assets/2024/10/resi-14',
    alt: 'Two roofers tearing off the old shingles on a light blue two-story house, with a ladder against the roof and blue tarps on the ground',
  },
}

/** Moves every reference; returns { refs, alt, caption } so a miss is reported. */
function swapFeatured(doc, spec) {
  const slashEscaped = (s) => s.replace(/\//g, '\\/')
  let refs = 0
  for (const [a, b] of [[spec.from, spec.to], [slashEscaped(spec.from), slashEscaped(spec.to)]]) {
    const parts = doc.html.split(a)
    refs += parts.length - 1
    doc.html = parts.join(b)
  }
  let alt = false
  const src = `src="${spec.to}.webp"`
  doc.html = doc.html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (!tag.includes(src)) return tag
    alt = true
    const value = ` alt="${escapeAttr(spec.alt)}"`
    return /\salt=("[^"]*"|'[^']*')/i.test(tag)
      ? tag.replace(/\salt=("[^"]*"|'[^']*')/i, value)
      : tag.replace(/\s*\/?>$/, (end) => `${value}${end}`)
  })
  let caption = false
  const y = getYoastGraph(doc.html)
  const node = y && y.graph.find((n) => n['@id'] === `${SITE}${doc.url}#primaryimage`)
  if (node) {
    node.caption = spec.alt
    doc.html = replaceJsonLd(doc.html, y.block, y.data)
    caption = true
  }
  return { refs, alt, caption }
}

export function transformDoc(doc, ctx) {
  const rep = ctx.report.photos
  if (doc.url === '/') {
    // Elementor emits the photo twice (widgets ee0f085 and e3f1ab4), so every
    // copy goes, or the old crew is still on the page.
    const re = /<img\b[^>]*\bsrc="[^"]*\/SEMI8066\.jpg\.webp"[^>]*>/gi
    const n = (doc.html.match(re) || []).length
    if (n) {
      doc.html = doc.html.replace(re, teamImg)
      rep.homepageTeamPhotos = n
    } else {
      console.warn('  ! photos: homepage group photo (SEMI8066) not found')
    }
  }
  if (doc.url === '/about-us/') {
    const re = /<div class="[^"]*\belementor-element-835db18\b[^"]*"/
    const m = doc.html.match(re)
    if (m) {
      doc.html = doc.html.slice(0, m.index) + band() + doc.html.slice(m.index)
      rep.aboutBand = true
    } else {
      console.warn('  ! photos: About Us team section (835db18) not found')
    }
  }
  if (FEATURED[doc.url]) {
    const done = swapFeatured(doc, FEATURED[doc.url])
    rep.featuredImageRefs = (rep.featuredImageRefs || 0) + done.refs
    if (!done.refs || !done.alt || !done.caption) {
      console.warn(`  ! photos: featured image swap on ${doc.url} incomplete: ${JSON.stringify(done)}`)
    }
  }
}
