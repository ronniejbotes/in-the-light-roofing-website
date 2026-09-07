/**
 * Image attributes: alt text, intrinsic dimensions, lazy loading.
 *
 * ALT TEXT is read from build/alt-text.json, a map of image URL (as served,
 * /assets/...) to alt text, applied wherever the <img> has no alt or an empty
 * one. The map is written by hand from what each image shows and where it
 * sits -- never generated from the filename alone, because a camera name like
 * SEMI7900 says nothing and a wrong guess ("Bryson Berard") is worse than no
 * alt at all. An entry of "" marks an image as decorative on purpose.
 * Filename-shaped alts the mirror already carries (alt="header-logo1.") are
 * replaced only when the map has an entry for that image.
 *
 * DIMENSIONS come from build/image-dims.json, precomputed with sharp from the
 * mirror's uploads so the deploy build needs no node_modules. Adding
 * width/height to an <img> that had neither lets the browser reserve the box
 * before the file arrives, which is what stops the page jumping as images
 * load. The theme sizes images with CSS (max-width:100%; height:auto), so the
 * attributes set the aspect ratio and nothing else.
 *
 * LAZY LOADING is added to images that have no loading attribute and are not
 * among the first few in the document -- the header logo and anything in the
 * hero must load eagerly or the largest paint gets later, not sooner. The
 * cut-off is deliberately conservative; the perf module can mark a specific
 * image as the LCP candidate and this leaves it alone.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { escapeAttr } from './lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Images this far into the document keep their eager default. */
export const EAGER_FIRST_N = 3

/**
 * Rewrites keyed on the alt text itself, for the same wrong alt repeated
 * everywhere. The eight service icons in the "Service Areas" strip were
 * exported from the Bethlehem page and carry "… Bethlehem Icon" on all 34
 * pages they appear on, including Allentown's. An icon has no town.
 */
const ALT_REWRITES = [
  [/^(.+?) Bethlehem Icon$/i, '$1 icon'],
]

let ALT = {}

export async function before(ctx) {
  const p = join(HERE, '..', 'alt-text.json')
  ALT = existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : {}
  ctx.report.alt.altEntries = Object.keys(ALT).length
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`, 'i'))
  return m ? (m[2] ?? m[3]) : null
}

function setAttr(tag, name, value) {
  const re = new RegExp(`\\s${name}=("[^"]*"|'[^']*')`, 'i')
  const piece = ` ${name}="${escapeAttr(value)}"`
  if (re.test(tag)) return tag.replace(re, piece)
  return tag.replace(/\s*\/?>$/, (end) => `${piece}${end}`)
}

/** Strip the query and hash off a served URL so it keys into the maps. */
function key(src) {
  if (!src) return null
  let s = src.split('?')[0].split('#')[0]
  if (s.startsWith('https://inthelightroofing.com')) s = s.slice('https://inthelightroofing.com'.length)
  return s
}

export async function transformDoc(doc, ctx) {
  const rep = ctx.report.alt
  const bump = (k, by = 1) => { rep[k] = (rep[k] || 0) + by }
  let i = 0
  doc.html = doc.html.replace(/<img\b[^>]*>/gi, (tag) => {
    const n = i++
    let out = tag
    // Elementor's lazy gallery uses data-thumbnail placeholders; leave them.
    if (/\sdata-thumbnail=/.test(tag)) return tag
    const src = key(attr(tag, 'src') || attr(tag, 'data-src'))

    // alt
    const alt = attr(tag, 'alt')
    if (src && Object.prototype.hasOwnProperty.call(ALT, src) && (alt === null || alt === '' || ALT[src] !== alt) && (alt === null || alt === '' || /^[\w.-]+$/.test(alt))) {
      out = setAttr(out, 'alt', ALT[src]); bump('altSet')
    } else if (alt === null) {
      // No alt attribute at all is worse than an empty one: screen readers
      // fall back to reading the filename aloud.
      out = setAttr(out, 'alt', ''); bump('altEmptied')
    } else {
      for (const [re, to] of ALT_REWRITES) {
        if (re.test(alt)) { out = setAttr(out, 'alt', alt.replace(re, to)); bump('altRewritten'); break }
      }
    }

    // width/height
    if (src && ctx.dims[src] && attr(tag, 'width') === null && attr(tag, 'height') === null) {
      const [w, h] = ctx.dims[src]
      out = setAttr(out, 'width', String(w))
      out = setAttr(out, 'height', String(h))
      bump('dimsAdded')
    }

    // loading / decoding
    if (attr(tag, 'loading') === null && n >= EAGER_FIRST_N && !/\sfetchpriority=/.test(tag)) {
      out = setAttr(out, 'loading', 'lazy'); bump('lazyAdded')
    }
    if (attr(tag, 'decoding') === null) { out = setAttr(out, 'decoding', 'async'); bump('decodingAdded') }
    return out
  })
}
