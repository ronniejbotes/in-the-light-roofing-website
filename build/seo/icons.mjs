/**
 * Move the large inline SVGs out of the HTML and into cached files.
 *
 * The icons on this site are machine-traced bitmaps, not drawn vectors: 400 to
 * 500 bezier segments to paint a phone glyph at 26px, and in the worst case a
 * 1114x212 base64 PNG wrapped in an <svg>, masked down, and rendered at 14x14.
 * Inlined, they are 46% of the homepage: 319,581 bytes of the 691,938 the
 * browser must download and parse before it can build the DOM, on a page whose
 * job above the fold is a form.
 *
 * Site-wide there are 2,275 of them over 424 pages, 43.4MB of HTML, and only 23
 * distinct shapes. They are identical bytes repeated across every page, in the
 * one place a browser is guaranteed not to cache. Externalised, the 23 shapes
 * are fetched once each and every later page reuses them.
 *
 * Written as <img> rather than an <svg><use> sprite because none of these 23
 * carry currentColor, a class or an id, so nothing in the CSS reaches inside
 * them and there is nothing for a sprite to buy. <img> also gets the browser's
 * own caching and decoding for free.
 *
 * alt="" is correct for most of them: they sit beside the text they illustrate,
 * so naming them would make a screen reader read the label twice. Explicit
 * width and height keep the layout stable, which inline SVG was already giving
 * us and an <img> would otherwise lose.
 *
 * The exception is an SVG that is the entire content of a link, which is 849 of
 * them and the larger half of the weight. alt="" there would leave the link
 * with no accessible name, so each case is decided on what the link already
 * says for itself:
 *   - 425 are click-to-call icons whose <a> carries aria-label="Phone Number".
 *     The name is already on the link, so the image is decorative and alt=""
 *     is not merely safe but correct.
 *   - 424 are the Google review badge, whose <a> goes to a Google search for
 *     the company and carries no aria-label, no title and no text. That link
 *     announces as nothing today, which is a bug this pass can fix rather than
 *     step around: NAMED_LINKS gives it an alt that says where it goes. The
 *     name is read off the href, not invented.
 * Anything else that is alone inside an unnamed link is left inline, because
 * silently emptying its name would be a regression.
 *
 * No loading="lazy". These are icons, several sit in the header, and a lazily
 * loaded 20px glyph pops in after paint for no gain.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

/** Below this, an external file costs more in overhead than it saves. */
const MIN_BYTES = 3000

const DIR = '_assets/icons'

/**
 * Alt text for an icon that is the whole content of an otherwise unnamed link,
 * matched on where the link points. Only what the href already tells us.
 */
const NAMED_LINKS = [
  [/^https:\/\/www\.google\.com\/search\?q=in\+the\+light\+roofing/i, 'In The Light Roofing on Google'],
]

/** hash -> svg source, collected across every page, written once in after(). */
const seen = new Map()

const SVG = /<svg\b[^>]*>[\s\S]*?<\/svg>/gi

function dimensions(svg) {
  const w = /<svg[^>]*\bwidth="(\d+(?:\.\d+)?)"/i.exec(svg)
  const h = /<svg[^>]*\bheight="(\d+(?:\.\d+)?)"/i.exec(svg)
  if (w && h) return [Math.round(+w[1]), Math.round(+h[1])]
  const vb = /<svg[^>]*\bviewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i.exec(svg)
  if (vb) return [Math.round(+vb[1]), Math.round(+vb[2])]
  return null
}

/**
 * Decide the alt for an svg, or null to leave it inline.
 *
 * Anything not alone inside a link is decorative and takes alt="". An svg that
 * IS the whole content of a link takes alt="" only when the link names itself;
 * otherwise it needs a name of its own, or it stays where it is.
 */
function altFor(html, start, end) {
  const before = html.slice(Math.max(0, start - 900), start)
  const openers = before.match(/<a\b[^>]*>/gi)
  const closesAfter = /^\s*<\/a>/i.test(html.slice(end, end + 40))
  if (!openers || !/<a\b[^>]*>\s*$/i.test(before) || !closesAfter) return ''

  const link = openers[openers.length - 1]
  if (/\baria-label="[^"]+"/i.test(link) || /\btitle="[^"]+"/i.test(link)) return ''

  const href = /\bhref="([^"]*)"/i.exec(link)
  if (href) {
    for (const [re, alt] of NAMED_LINKS) if (re.test(href[1])) return alt
  }
  return null
}

export function transformDoc(doc, ctx) {
  const html = doc.html
  if (!html.includes('<svg')) return

  const bump = (k, n = 1) => { ctx.report.icons[k] = (ctx.report.icons[k] || 0) + n }

  let out = ''
  let at = 0
  let moved = 0
  SVG.lastIndex = 0
  let m
  while ((m = SVG.exec(html))) {
    const svg = m[0]
    if (svg.length < MIN_BYTES) continue

    const dims = dimensions(svg)
    if (!dims) { bump('skippedNoDimensions'); continue }
    const alt = altFor(html, m.index, m.index + svg.length)
    if (alt === null) { bump('keptUnnamedInLink'); continue }
    if (alt) bump('linksNamed')

    const hash = createHash('sha1').update(svg).digest('hex').slice(0, 12)
    if (!seen.has(hash)) seen.set(hash, svg)

    out += html.slice(at, m.index)
    out += `<img src="/${DIR}/${hash}.svg" width="${dims[0]}" height="${dims[1]}" alt="${alt}" decoding="async">`
    at = m.index + svg.length
    moved++
    bump('bytesSaved', svg.length)
  }
  if (!moved) return

  out += html.slice(at)
  doc.html = out
  bump('moved', moved)
  bump('pages')
}

export async function after(ctx) {
  if (!seen.size) return
  const dir = join(ctx.OUT, DIR)
  await mkdir(dir, { recursive: true })
  let bytes = 0
  for (const [hash, svg] of seen) {
    await writeFile(join(dir, `${hash}.svg`), svg, 'utf8')
    bytes += svg.length
  }
  ctx.report.icons.filesWritten = seen.size
  ctx.report.icons.filesBytes = bytes
  // Cleared so a second seo() call in the same process starts fresh.
  seen.clear()
}
