/**
 * Content edits: titles, descriptions, H1s and sentence-level fixes.
 *
 * Everything here is an exact edit to an exact page, applied at publish time so
 * mirror/ stays the byte-faithful capture. The engine is generic; the data at
 * the top is the spec. Rules the data must obey, because this is a real
 * business's website:
 *
 *   - Only facts the site already states. No hail/wind specifics, no "24/7",
 *     no certification wording, no prices, no response times -- those are
 *     gated on the owner (see keyword-map.md section 5).
 *   - US English: the audience is Pennsylvania homeowners.
 *   - No URL changes. Every edit is to a page that keeps its address.
 *   - A find string must match exactly once on its page, or the build says so.
 *
 * When a title changes, og:title, twitter:title and the WebPage name in the
 * JSON-LD change with it; when a description changes, og:description,
 * twitter:description and the WebPage description follow. Search, social and
 * schema then agree, which is the point.
 */
import {
  SITE, getTitle, setTitle, getMeta, setMeta, getYoastGraph, replaceJsonLd, replaceOnce, replaceAll, escapeHtml,
} from './lib.mjs'

/* ------------------------------------------------------------------ spec */

/** url -> new <title>. Keep under ~60 characters. */
export const TITLES = {}

/** url -> new meta description (120-158 characters, plain language, town or region named). */
export const DESCRIPTIONS = {}

/**
 * url -> new H1 inner HTML. The theme's service-page H1s use
 * `Main<span>sub-line</span>`; the span renders on its own line, so keep that
 * shape when a sub-line is wanted: 'Roof Repairs <span>in the Lehigh Valley</span>'.
 */
export const H1 = {}

/** url -> [{ find, replace }] exact, once-per-page text edits. */
export const REPLACEMENTS = {
  // A find-and-replace on the live site left a sentence naming a town in the
  // wrong grammatical slot. The page is regional; say so.
  '/services/new-roof-installation/': [
    { find: 'In the Whitehall, In the Light Roofing is your go-to partner', replace: 'In the Lehigh Valley, In the Light Roofing is your go-to partner' },
  ],
  // The H1 is "Roof Inspections" with the sub-line in a span; with no space
  // between them anything that reads the text sees "Roof InspectionsServices".
  '/services/roof-inspections/': [
    { find: 'Roof Inspections<span>Services in Pennsylvania</span>', replace: 'Roof Inspections <span>Services in Pennsylvania</span>' },
  ],
  // The Easton page references a photograph that does not exist on the live
  // site either (resi-17.webp 404s). The sibling in the same set that the page
  // does not already show stands in for it -- a broken image is worse than a
  // different roof.
  '/service-area/easton/': [
    { find: 'src="/assets/2024/10/resi-17.webp"', replace: 'src="/assets/2024/10/resi-18.webp"' },
  ],
}

/** Site-wide exact replacements: [find, replace]. */
export const GLOBAL_REPLACEMENTS = [
  // Four posts link to a Bethlehem page that never existed. The real one:
  ['href="/service-area/roofing-contractors-bethlehem-pa/"', 'href="/service-area/roofers-bethlehem-pa/"'],
]

/**
 * Posts whose body was pasted from a chat tool with every section heading as an
 * <h1 data-start=... data-end=...>. Eight H1s on one post; the seven pasted
 * ones become H2s and the paste attributes go.
 */
export const DEMOTE_PASTED_H1 = new Set(['/summer-roof-inspection-checklist-lehigh-valley-2026/'])

/* ---------------------------------------------------------------- engine */

function setH1(html, inner) {
  // Only the first <h1>; the pasted-H1 posts are handled separately.
  return html.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i, (m, open, close) => `${open}${inner}${close}`)
}

function syncGraph(html, { title, description }) {
  const y = getYoastGraph(html)
  if (!y) return html
  const page = y.graph.find((n) => n['@type'] === 'WebPage' || (Array.isArray(n['@type']) && n['@type'].includes('WebPage')))
  if (!page) return html
  if (title) page.name = title
  if (description) page.description = description
  return replaceJsonLd(html, y.block, y.data)
}

export async function transformDoc(doc, ctx) {
  const rep = ctx.report.content
  const bump = (k, by = 1) => { rep[k] = (rep[k] || 0) + by }
  const miss = (what) => { (rep.unmatched ||= []).push(`${doc.url} ${what}`) }
  let html = doc.html
  const url = doc.url

  if (TITLES[url] && getTitle(html) !== TITLES[url]) {
    html = setTitle(html, TITLES[url])
    html = setMeta(html, 'og:title', TITLES[url])
    if (getMeta(html, 'twitter:title')) html = setMeta(html, 'twitter:title', TITLES[url])
    bump('titles')
  }

  if (DESCRIPTIONS[url] && getMeta(html, 'description') !== DESCRIPTIONS[url]) {
    html = setMeta(html, 'description', DESCRIPTIONS[url])
    html = setMeta(html, 'og:description', DESCRIPTIONS[url])
    if (getMeta(html, 'twitter:description')) html = setMeta(html, 'twitter:description', DESCRIPTIONS[url])
    bump('descriptions')
  }

  if (TITLES[url] || DESCRIPTIONS[url]) html = syncGraph(html, { title: TITLES[url], description: DESCRIPTIONS[url] })

  if (H1[url]) {
    if (/<h1\b/i.test(html)) { html = setH1(html, H1[url]); bump('h1s') } else miss('has no <h1> to replace')
  }

  for (const { find, replace } of REPLACEMENTS[url] || []) {
    const n = html.split(find).length - 1
    if (n === 1) { html = html.split(find).join(replace); bump('replacements') } else miss(`find matched ${n}x: ${find.slice(0, 60)}`)
  }

  for (const [find, replace] of GLOBAL_REPLACEMENTS) {
    const [next, n] = replaceAll(html, find, replace)
    if (n) { html = next; bump('globalReplacements', n) }
  }

  if (DEMOTE_PASTED_H1.has(url)) {
    let n = 0
    html = html.replace(/<h1(\s+data-start="[^"]*"\s+data-end="[^"]*")>([\s\S]*?)<\/h1>/gi, (m, attrs, inner) => { n++; return `<h2>${inner}</h2>` })
    if (n) bump('h1sDemoted', n); else miss('no pasted <h1 data-start> found')
  }

  doc.html = html
}
