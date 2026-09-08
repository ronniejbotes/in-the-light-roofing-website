/**
 * Accessible names for links whose visible text says nothing.
 *
 * The Essential Addons post grid ends every card with
 * `<a href="/slug/" class="eael-post-elements-readmore-btn">Read More</a>`.
 * There are 3,276 of them across 182 archive, tag, category and blog pages, 18
 * per page, and every one announces as "Read More" and nothing else. A screen
 * reader user pulling up the list of links on /blog/ gets eighteen identical
 * entries, which is the same as getting none: the standard way to move through
 * a page of links is to list them, and this list cannot be read.
 *
 * The fix costs no new content, because the title is already in the card. Two
 * elements up, the heading is
 * `<a class="eael-grid-post-link" href="/slug/" title="Full Title">`, keyed on
 * the same href, so each Read More can be named from the post it opens without
 * inventing a word. The visible text is left alone: sighted users keep the
 * short button, and aria-label replaces the accessible name only.
 *
 * Keyed on href rather than on document order because the grid interleaves
 * overlay anchors and thumbnail links between the heading and the button, and
 * position is the thing most likely to change if the widget is ever re-saved.
 */

/** `<a class="eael-grid-post-link" href="..." title="...">` -> href -> title. */
const TITLE_LINK = /<a\b[^>]*\bclass="[^"]*\beael-grid-post-link\b[^"]*"[^>]*>/gi

/** The Read More button itself, in either attribute order. */
const READ_MORE = /<a\b([^>]*\bclass="[^"]*\beael-post-elements-readmore-btn\b[^"]*"[^>]*)>/gi

const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)
  return m ? m[1] : null
}

export function transformDoc(doc, ctx) {
  const html = doc.html
  if (!html.includes('eael-post-elements-readmore-btn')) return

  const bump = (k, n = 1) => { ctx.report.a11y[k] = (ctx.report.a11y[k] || 0) + n }

  // Titles first: the whole document, so a card's heading is found wherever the
  // widget put it relative to its button.
  const titles = new Map()
  for (const tag of html.match(TITLE_LINK) || []) {
    const href = attr(tag, 'href')
    const title = attr(tag, 'title')
    if (href && title && !titles.has(href)) titles.set(href, title)
  }
  if (!titles.size) { bump('pagesWithNoTitles'); return }

  let named = 0
  let unnamed = 0
  doc.html = html.replace(READ_MORE, (tag, inner) => {
    if (/\baria-label=/i.test(inner)) return tag
    const title = titles.get(attr(tag, 'href'))
    if (!title) { unnamed++; return tag }
    named++
    // The title attribute is already HTML-escaped in the source markup, so it
    // is copied across as-is rather than escaped twice.
    return `<a${inner} aria-label="Read more: ${title}">`
  })

  bump('named', named)
  if (unnamed) bump('unmatched', unnamed)
  bump('pages')
}

export function after(ctx) {
  const r = ctx.report.a11y
  if (r.unmatched) r.note = 'unmatched = Read More buttons whose href had no titled heading on the page'
}
