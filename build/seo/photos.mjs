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
 *
 * Done here rather than in overrides.js so the photographs are in the HTML a
 * crawler reads, with real alt text, instead of being painted in by script.
 */
import { escapeAttr } from './lib.mjs'

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
}
