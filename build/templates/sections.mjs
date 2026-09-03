import { esc, attr, each, when } from '../lib/html.mjs'
import { renderBlock, isRule, img, normaliseHref } from './blocks.mjs'

/* ---------------------------------------------------------------------------
   Section composer.

   The source is a flat, ordered list of Elementor widgets per section. Rather
   than reproducing Elementor's nested div soup, each section is classified by
   what it actually contains and rendered with a layout that suits it. Block
   ORDER is always preserved, and no block is ever dropped.
   --------------------------------------------------------------------------- */

const REVEAL_FOR = { fadeIn: 'fade', fadeInUp: 'up', fadeInDown: 'fade' }
const rev = (b, fallback = 'up') => ` data-reveal="${REVEAL_FOR[b?.anim] || fallback}"`

/** Split a section's blocks into a heading group and the rest. */
function partition(blocks) {
  const head = []
  let i = 0
  // Leading eyebrow-ish richtext, the heading, its lede and the brand rule.
  while (i < blocks.length) {
    const b = blocks[i]
    const isHeadish =
      b.type === 'heading' ||
      isRule(b) ||
      (b.type === 'richtext' && head.length <= 2 && !head.some((h) => h.type === 'richtext' && h !== b))
    if (!isHeadish) break
    head.push(b)
    i++
    if (b.type === 'heading' && head.filter((x) => x.type === 'heading').length >= 1) {
      // allow one lede + one rule after the heading, then stop
      let extra = 0
      while (i < blocks.length && extra < 2) {
        const n = blocks[i]
        if (isRule(n) || (n.type === 'richtext' && extra === 0)) { head.push(n); i++; extra++ }
        else break
      }
      break
    }
  }
  return { head, rest: blocks.slice(i) }
}

function renderHead(head, id, center) {
  if (!head.length) return ''
  const inner = head
    .map((b, k) => renderBlock(b, `${id}-h${k}`))
    .join('')
  return `<div class="section-head${center ? ' section-head--center' : ''}"${rev(head[0])}>${inner}</div>`
}

const countOf = (blocks, t) => blocks.filter((b) => b.type === t).length

/**
 * Background images bypass <picture>, so they get the same treatment through
 * image-set(): AVIF first, then WebP, with the original URL last as the
 * fallback for browsers that support neither. The original stays referenced,
 * so its URL is never orphaned.
 */
let BG_IMAGES = {}
export const setBackgroundManifest = (m) => { BG_IMAGES = m || {} }

function bgValue(src) {
  const d = BG_IMAGES[src]
  const orig = `url('${src}')`
  if (!d) return orig
  const pick = (list) => (list?.length ? list[list.length - 1].url : null)
  const avif = pick(d.avif)
  const webp = pick(d.webp)
  if (!avif && !webp) return orig
  const set = [
    avif && `url('${avif}') type('image/avif')`,
    webp && `url('${webp}') type('image/webp')`,
    `url('${src}')`,
  ].filter(Boolean).join(', ')
  // The plain url() first is the fallback for engines that ignore image-set.
  return `${orig}; background-image: image-set(${set})`
}

/** The brand dark is #14161E; Elementor writes it literally, as the global
 *  colour variable, or as pure black on photo overlays. */
const DARKS = /^(#14161e|#000000|#000|var\(\s*--e-global-color-secondary\s*\))$/i
const isDark = (s) => DARKS.test((s.background_color || '').trim())

/** #14161E0D is the brand dark at 5% -- Elementor's very light grey band. */
const isTint = (s) => /^#14161e0d$/i.test((s.background_color || '').trim())

/**
 * The opening section of a page, when it carries the page's H1 over a photo,
 * is rendered as a hero: full-bleed image, scrim, headline and CTAs on the
 * left, and the quote form (if the section has one) alongside it.
 */
function renderHero(section, ctx, index) {
  const blocks = section.blocks || []
  const id = `s${index}`

  const h1 = blocks.find((b) => b.type === 'heading' && b.level === 1)
  const formBlock = blocks.find((b) => b.type === 'form')

  // The form's own heading and intro sit before it in source order; keep them
  // with the form rather than stranding them in the headline column.
  let asideFrom = blocks.length
  if (formBlock) {
    const fi = blocks.indexOf(formBlock)
    asideFrom = fi
    for (let i = fi - 1; i >= 0; i--) {
      const b = blocks[i]
      if (b.type === 'heading' && b.level !== 1) { asideFrom = i; break }
      if (b.type === 'richtext' || isRule(b)) { asideFrom = i; continue }
      break
    }
  }
  const lead = blocks.slice(0, asideFrom)
  const asideBlocks = blocks.slice(asideFrom)

  const buttons = lead.filter((b) => b.type === 'button')
  const rest = lead.filter((b) => b !== h1 && b.type !== 'button' && !isRule(b))

  const headline = h1
    ? `<h1>${h1.lead
        ? `<span class="lead">${esc(h1.lead)}</span>${h1.rest ? ' ' + esc(h1.rest) : ''}`
        : esc(h1.text)}</h1>`
    : ''

  const copy =
    `<div data-reveal="left">` +
    headline +
    each(rest, (b, k) =>
      b.type === 'richtext'
        ? `<div class="hero__sub">${renderBlock(b, `${id}-r${k}`)}</div>`
        : `<div class="stack">${renderBlock(b, `${id}-r${k}`)}</div>`
    ) +
    when(buttons.length, () =>
      `<div class="btn-row">${each(buttons, (b, k) =>
        renderBlock(b, `${id}-b${k}`, { secondary: k > 0, onDark: true }))}</div>`
    ) +
    `</div>`

  const aside = formBlock
    ? `<div class="form-card" data-reveal="right">` +
      each(asideBlocks, (b, k) => renderBlock(b, `${id}-a${k}`)) +
      `</div>`
    : ''

  // A hero that is just a page title (several interior pages are exactly that)
  // should be a title band, not a 78vh photo panel with nothing in it.
  const sparse = !aside && !buttons.length && rest.length === 0

  return (
    `<section class="hero${sparse ? ' hero--compact' : ''}"` +
    `${section.background ? ` style="background-image:${bgValue(section.background)}"` : ''}>` +
    `<div class="container">` +
    (aside ? `<div class="hero__grid">${copy}${aside}</div>` : copy) +
    `</div></section>`
  )
}

export function renderSection(section, ctx, index) {
  const blocks = section.blocks || []
  if (!blocks.length) return ''

  // A leading section that owns the H1 is the page hero.
  if (index === 0 && blocks.some((b) => b.type === 'heading' && b.level === 1)) {
    return renderHero(section, ctx, index)
  }

  const id = `s${index}`
  const { head, rest } = partition(blocks)

  const nFeature = countOf(rest, 'feature')
  const nImage = rest.filter((b) => b.type === 'image' && !isRule(b)).length
  const nText = countOf(rest, 'richtext')
  const hasForm = rest.some((b) => b.type === 'form')
  const hasAccordion = rest.some((b) => b.type === 'accordion')
  const hasReviews = rest.some((b) => b.type === 'reviews')
  const hasCarousel = rest.some((b) => b.type === 'carousel')
  const hasGallery = rest.some((b) => b.type === 'gallery')
  const hasMapOrVideo = rest.some((b) => b.type === 'map' || b.type === 'video')

  const buttons = rest.filter((b) => b.type === 'button')
  const nonButtons = rest.filter((b) => b.type !== 'button')

  const onDark = isDark(section) || !!section.background
  const btnRow = buttons.length
    ? `<div class="btn-row"${rev(buttons[0])}>${each(buttons, (b, k) =>
        renderBlock(b, `${id}-b${k}`, { secondary: k > 0, onDark }))}</div>`
    : ''

  const dark = isDark(section)
  const bg = section.background

  const sectionAttrs =
    ` class="section${dark && !bg ? ' section--dark' : ''}` +
    `${isTint(section) ? ' section--alt' : ''}${bg ? ' section--bg' : ''}"` +
    (bg ? ` style="background-image:${bgValue(bg)}"` : '')

  const wrap = (inner, center = false) =>
    `<section${sectionAttrs}><div class="container">${renderHead(head, id, center)}${inner}</div></section>`

  /* --- contact-style section: details on one side, quote form on the other */
  if (hasForm && nFeature >= 2) {
    const f = rest.find((b) => b.type === 'form')
    const feats = rest.filter((b) => b.type === 'feature')
    const others = nonButtons.filter(
      (b) => b !== f && b.type !== 'feature' &&
             !(b.type === 'heading' && rest.indexOf(b) < rest.indexOf(f))
    )
    const formHead = rest.filter(
      (b) => b.type === 'heading' && rest.indexOf(b) < rest.indexOf(f)
    )
    return wrap(
      `<div class="split">` +
      `<div class="stack stack--lg" data-reveal="left">` +
      `<div class="grid grid--${feats.length >= 3 ? 1 : 1}" data-reveal-group>` +
      each(feats, (b, k) => renderBlock(b, `${id}-c${k}`)) +
      `</div>` +
      each(others, (b, k) => renderBlock(b, `${id}-o${k}`)) +
      `</div>` +
      `<div class="form-card" data-reveal="right">` +
      each(formHead, (b, k) => renderBlock(b, `${id}-fh${k}`)) +
      renderBlock(f, `${id}-form`) +
      `</div></div>` + btnRow
    )
  }

  /* --- feature grids ------------------------------------------------- */
  if (nFeature >= 2) {
    const cols = nFeature % 3 === 0 || nFeature > 4 ? 3 : 2

    // A numbered process ("01" heading, then the step, repeated) arrives as a
    // flat alternating list. Pair each number with the step it labels instead
    // of stacking all the numbers above all the cards.
    const steps = []
    let pending = null
    const leftovers = []
    for (const b of rest) {
      if (b.type === 'heading' && /^\d{1,2}$/.test((b.text || '').trim())) {
        pending = b.text.trim()
        continue
      }
      if (b.type === 'feature') {
        steps.push({ num: pending, block: b })
        pending = null
        continue
      }
      if (b.type !== 'button') leftovers.push(b)
    }
    const numbered = steps.some((s) => s.num)

    return wrap(
      when(leftovers.length, () =>
        `<div class="stack"${rev(leftovers[0])}>${each(leftovers, (b, k) => renderBlock(b, `${id}-o${k}`))}</div>`) +
      `<div class="grid grid--${cols}" data-reveal-group>` +
      each(steps, (s, k) =>
        `<div${rev(s.block)}>` +
        (numbered
          ? `<div class="step">${when(s.num, () => `<div class="step__num">${esc(s.num)}</div>`)}` +
            `${renderBlock(s.block, `${id}-f${k}`)}</div>`
          : renderBlock(s.block, `${id}-f${k}`)) +
        `</div>`) +
      `</div>` + btnRow,
      true
    )
  }

  /* --- FAQ ------------------------------------------------------------ */
  if (hasAccordion) {
    const acc = rest.find((b) => b.type === 'accordion')
    const others = nonButtons.filter((b) => b !== acc)
    return wrap(
      `<div${rev(acc, 'fade')}>${renderBlock(acc, `${id}-acc`)}</div>` +
      when(others.length, () => `<div class="stack" style="margin-top:32px">${each(others, (b, k) => renderBlock(b, `${id}-o${k}`))}</div>`) +
      btnRow
    )
  }

  /* --- form / reviews / gallery / media ------------------------------- */
  if (hasForm) {
    const f = rest.find((b) => b.type === 'form')
    const others = nonButtons.filter((b) => b !== f)
    return wrap(
      `<div class="split">` +
      `<div class="stack"${rev(others[0], 'left')}>${each(others, (b, k) => renderBlock(b, `${id}-o${k}`))}${btnRow}</div>` +
      `<div class="form-card"${rev(f, 'right')}>${renderBlock(f, `${id}-form`)}</div>` +
      `</div>`
    )
  }

  if (hasReviews || hasCarousel || hasGallery || hasMapOrVideo) {
    // Several videos in one section belong side by side; stacked 16:9 frames
    // turn into an endless black column.
    const videos = nonButtons.filter((b) => b.type === 'video')
    if (videos.length > 1) {
      const others = nonButtons.filter((b) => b.type !== 'video')
      return wrap(
        when(others.length, () =>
          each(others, (b, k) => `<div${rev(b, 'fade')}>${renderBlock(b, `${id}-m${k}`)}</div>`)) +
        `<div class="grid grid--${videos.length % 3 === 0 ? 3 : 2}" data-reveal-group>` +
        each(videos, (b, k) => `<div${rev(b, 'fade')}>${renderBlock(b, `${id}-v${k}`)}</div>`) +
        `</div>` + btnRow,
        true
      )
    }
    return wrap(
      each(nonButtons, (b, k) => `<div${rev(b, 'fade')}>${renderBlock(b, `${id}-m${k}`)}</div>`) + btnRow,
      hasReviews || hasCarousel
    )
  }

  /* --- image + text split --------------------------------------------- */
  if (nImage === 1 && (nText >= 1 || head.length)) {
    const image = rest.find((b) => b.type === 'image' && !isRule(b))
    const others = nonButtons.filter((b) => b !== image)
    const reverse = rest.indexOf(image) > 0
    return `<section${sectionAttrs}><div class="container">` +
      `<div class="split${reverse ? '' : ' split--reverse'}">` +
      `<div class="media"${rev(image, reverse ? 'right' : 'left')}>${renderBlock(image, `${id}-img`, { sizes: '(max-width: 900px) 100vw, 50vw' })}</div>` +
      `<div${rev(head[0] || others[0], reverse ? 'left' : 'right')}>` +
      renderHead(head, id, false).replace('section-head', 'section-head section-head--split') +
      `<div class="stack">${each(others, (b, k) => renderBlock(b, `${id}-o${k}`))}</div>${btnRow}` +
      `</div></div></div></section>`
  }

  /* --- default: stacked -------------------------------------------------- */
  const centred = !nonButtons.length || (nonButtons.length === 1 && nonButtons[0].type === 'richtext')
  return wrap(
    when(nonButtons.length, () =>
      `<div class="stack stack--lg" data-reveal-group>${each(nonButtons, (b, k) => `<div${rev(b)}>${renderBlock(b, `${id}-o${k}`)}</div>`)}</div>`
    ) + btnRow,
    centred
  )
}

/** Render all sections of a page. */
export function renderSections(sections, ctx) {
  return each(sections, (s, i) => renderSection(s, ctx, i))
}
