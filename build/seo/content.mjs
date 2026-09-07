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
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SITE, getTitle, setTitle, getMeta, setMeta, getYoastGraph, replaceJsonLd, replaceOnce, replaceAll, escapeHtml,
} from './lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/* ------------------------------------------------------------------ spec */

/** url -> new <title>. Keep under ~60 characters. */
export const TITLES = {
  // The form confirmation carried the blog's title verbatim, so 21 pages shared one title.
  '/thank-you/': 'Thank You | In The Light Roofing',
}

/** url -> new meta description (120-158 characters, plain language, town or region named). */
export const DESCRIPTIONS = {
  '/thank-you/': 'Your message has been sent to In The Light Roofing. We will be in touch shortly.',
}

/**
 * url -> new H1 inner HTML. The theme's service-page H1s use
 * `Main<span>sub-line</span>`; the span renders on its own line, so keep that
 * shape when a sub-line is wanted: 'Roof Repairs <span>in the Lehigh Valley</span>'.
 */
export const H1 = {}

/**
 * url -> [{ find, replace }] exact, once-per-page text edits.
 *
 * The bulk of these live in edits.json, written from the content audit and
 * reviewed line by line: statewide "Pennsylvania" H1s become the Lehigh Valley
 * the company serves; town-page H1s that were the brand name become "Roofing
 * Contractor in <Town>, PA"; the insurance page stops promising to negotiate or
 * maximise a claim; "guarantee", "decades", "leading", "#1" and "top" go where
 * nothing on the site supports them; 34 sentences placing the company in Huron,
 * Ohio are corrected or cut. Three proposals were rejected: repointing the
 * Bethlehem tel: links (the number may be a live call-tracking line), changing
 * a form option's value attribute (a handler may key on it -- the label alone
 * is fixed), and a canonical edit that meta.mjs already makes.
 */
export const REPLACEMENTS = {
  // The Easton page references a photograph that does not exist on the live
  // site either (resi-17.webp 404s). The sibling in the same set that the page
  // does not already show stands in for it -- a broken image is worse than a
  // different roof.
  '/service-area/easton/': [
    { find: 'src="/assets/2024/10/resi-17.webp"', replace: 'src="/assets/2024/10/resi-18.webp"' },
    // The brand name in this sentence is wrapped in an <a>, so the edit starts after it.
    { find: ' is proud to contribute to the beauty and resilience of homes in this dynamic city.',
      replace: ' is proud to contribute to the beauty and resilience of homes in this dynamic city. If icicles are forming along your gutters this winter, read our guide to <a href="/ice-dam-prevention-in-easton/">ice dam prevention in Easton</a>.' },
  ],
  // The one verified Allentown-specific fact on the site is the address on
  // /contact/; it is the one truthful differentiator this page can carry.
  '/service-area/allentown/': [
    { find: ' is honored to contribute to the preservation of Allentown’s historic architecture.',
      replace: ' is honored to contribute to the preservation of Allentown’s historic architecture. Our office is at 871 N Fenwick St, Allentown, PA 18109 — call (484) 553-0213 or use the <a href="/contact/">contact page</a> to book a free estimate.' },
  ],
  // Third geography on one page: H1 said Pennsylvania, the description Lehigh
  // Valley, the body Center Valley. The brand link that follows is kept.
  '/services/roof-inspections/': [
    { find: 'In Center Valley, <a href="https://g.co/kgs/upMJXvq"', replace: 'In Allentown and across the Lehigh Valley, <a href="https://g.co/kgs/upMJXvq"' },
  ],
  // Ohio comparisons whose sentences carry inline markup the audit's plain-text
  // finds could not see.
  '/storm-damage-repair-in-macungie/': [
    { find: 'Just as roofing strategies differ between hail-prone areas like Huron and flood-prone regions in Ohio, <b>storm damage repair in Macungie</b>', replace: '<b>Storm damage repair in Macungie</b>' },
  ],
  '/common-summer-roofing-issues-allentown/': [
    { find: '</a> in Huron, Ohio, and let us help you keep your roof in excellent condition.', replace: '</a> in Allentown, PA, and let us help you keep your roof in excellent condition.' },
  ],
}

// edits.json also carries `date`, the day its edits were made.
const EDITS = existsSync(join(HERE, 'edits.json')) ? JSON.parse(readFileSync(join(HERE, 'edits.json'), 'utf8')) : { titles: {}, descriptions: {}, replacements: {}, ohio: {} }
Object.assign(TITLES, EDITS.titles)
Object.assign(DESCRIPTIONS, EDITS.descriptions)
for (const [u, list] of Object.entries(EDITS.replacements)) REPLACEMENTS[u] = [...(REPLACEMENTS[u] || []), ...list]
for (const [u, list] of Object.entries(EDITS.ohio)) REPLACEMENTS[u] = [...(REPLACEMENTS[u] || []), ...list]

/** Site-wide exact replacements: [find, replace]. */
export const GLOBAL_REPLACEMENTS = [
  // Four posts link to a Bethlehem page that never existed. The real one:
  ['href="/service-area/roofing-contractors-bethlehem-pa/"', 'href="/service-area/roofers-bethlehem-pa/"'],
  // The primary navigation's Home item pointed at /home/, a saved copy of the
  // homepage, on every page -- 1,288 anchors making the duplicate the most
  // linked URL on the site. The homepage is /.
  ['href="/home/"', 'href="/"'],
  // Twelve "Related Posts" items point at the other homepage draft; five at the
  // roof-repairs campaign copy. Send them to the pages those duplicate.
  ['href="/home-in-the-light-roofing-new-design/"', 'href="/"'],
  ['href="/services/roof-repairs-campaign/"', 'href="/services/roof-repairs/"'],
  // Twenty-one anchors hit the Center Valley 301 instead of the page.
  ['href="/service-area/center-valley/"', 'href="/service-area/center-valley-roofing-contractor/"'],
  // Three buttons link /contact without the slash and take a redirect each.
  ['href="/contact"', 'href="/contact/"'],
  // The brand's own casing -- logo, footer, BBB listing, homepage title -- is
  // "The". Yoast's title suffix on 591 pages had "the".
  ['| In the Light Roofing', '| In The Light Roofing'],
  // The estimate form's service dropdown, on every money page: the label is
  // fixed, the value attribute a handler may key on is left alone.
  ['>New Roof Installment</option>', '>New Roof Installation</option>'],
  ['>New Roof Installtion</a>', '>New Roof Installation</a>'],
  // Nine click-to-call links carry the display format inside the URI. Valid
  // dialers cope, but the E.164 form is what every other tel: link here uses.
  ['href="tel:(484) 553-0213"', 'href="tel:+14845530213"'],
  // One post states an availability the site nowhere else claims and the owner
  // has not confirmed. The repair claim stands; the hours claim goes.
  ['we offer 24/7 emergency services and expert <b>Storm Damage Repair</b> throughout Allentown', 'we offer expert <b>Storm Damage Repair</b> throughout Allentown'],
  // The boilerplate FAQ's first answer lost its full stop on 21 pages; the
  // Coplay variant has a space before a comma.
  ['scope and costs</div>', 'scope and costs.</div>'],
  ['commercial roofing , particularly', 'commercial roofing, particularly'],
]

/**
 * Anchors to remove outright, with their wrapping <li>: the "Related Posts"
 * widget on eight posts lists the form-confirmation page as a related post.
 */
export const REMOVE_LIST_ITEMS_LINKING_TO = ['/thank-you/']

/**
 * Site-wide regex replacements, for the few edits an exact string cannot
 * express. The "Service Areas" list on 27 pages ends with a Quakertown item
 * whose link goes nowhere (href="#"): there is no Quakertown page, and rule 4
 * says not to build one, so it points at the service-area hub instead.
 */
export const GLOBAL_REGEX_REPLACEMENTS = [
  { re: /<a href="#"((?:(?!<\/a>)[\s\S])*?<span class="elementor-icon-list-text">Quakertown<\/span>)/g, to: '<a href="/service-area/"$1' },
  // CleanTalk's anti-spam plugin replaced the email address with a masked
  // string that its own JavaScript decodes on click -- JavaScript that never
  // ran on this host, leaving "in**@***************ng.com" as a dead link on
  // eleven pages. The address is public on every footer.
  { re: /<a href="mailto:in\*\*@\*+ng\.com"[^>]*>[\s\S]*?<\/a>/g, to: '<a href="mailto:info@inthelightroofing.com">info@inthelightroofing.com</a>' },
  // Three service pages wrapped their own service phrase in a link OUT to the
  // company's Instagram -- the page's key phrase sending the reader away. The
  // words stay; the link goes.
  { re: /<a href="https:\/\/www\.instagram\.com\/inthelightroofing\/" target="_blank" rel="nofollow noopener external">(storm damage repair services|roof replacement|roofing)<\/a>/g, to: '$1' },
]

/**
 * Posts whose body was pasted from a chat tool with every section heading as an
 * <h1 data-start=... data-end=...>. Eight H1s on one post; the seven pasted
 * ones become H2s and the paste attributes go.
 */
export const DEMOTE_PASTED_H1 = new Set(['/summer-roof-inspection-checklist-lehigh-valley-2026/'])

/* ---------------------------------------------------------------- engine */

/** A regex source matching `find` with entity/whitespace variants of its characters. */
function tolerant(find) {
  const ENT = { '’': '(?:’|&#8217;|&rsquo;)', '‘': '(?:‘|&#8216;|&lsquo;)', '“': '(?:“|&#8220;|&ldquo;)', '”': '(?:”|&#8221;|&rdquo;)', '–': '(?:–|&#8211;|&ndash;)', '—': '(?:—|&#8212;|&mdash;)', '&': '(?:&amp;|&)', "'": "(?:'|&#039;|&#8217;)" }
  let out = ''
  for (const ch of find) {
    if (/\s/.test(ch)) { if (!out.endsWith('\\s+')) out += '\\s+'; continue }
    if (ENT[ch]) { out += ENT[ch]; continue }
    out += ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  }
  return out
}

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

/** The day the editorial edits were made; the sitemap reports it as lastmod for
    the pages whose visible content they changed. Untouched pages keep the date
    WordPress recorded. */
export const EDIT_DATE = EDITS.date || '2026-09-07'

export async function transformDoc(doc, ctx) {
  const rep = ctx.report.content
  const bump = (k, by = 1) => { rep[k] = (rep[k] || 0) + by }
  const miss = (what) => { (rep.unmatched ||= []).push(`${doc.url} ${what}`) }
  let html = doc.html
  const url = doc.url
  const original = html

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
    let n = html.split(find).length - 1
    if (n === 1) { html = html.split(find).join(replace); bump('replacements'); continue }
    if (n === 0) {
      // The mirror's headings break lines inside the tag ("Roof Repair\n<span>")
      // and WordPress stores curly quotes and ampersands as entities; a spec
      // written from rendered text has a space and the characters. Match on
      // any whitespace run and either form of each character, once.
      const re = new RegExp(tolerant(find), 'g')
      const hits = html.match(re) || []
      if (hits.length === 1) { html = html.replace(re, () => replace); bump('replacements'); continue }
      n = hits.length
    }
    miss(`find matched ${n}x: ${find.slice(0, 70)}`)
  }

  for (const [find, replace] of GLOBAL_REPLACEMENTS) {
    const [next, n] = replaceAll(html, find, replace)
    if (n) { html = next; bump('globalReplacements', n) }
  }

  for (const { re, to } of GLOBAL_REGEX_REPLACEMENTS) {
    let n = 0
    html = html.replace(re, (...m) => { n++; return to.replace(/\$(\d)/g, (_, d) => m[Number(d)] ?? '') })
    if (n) bump('regexReplacements', n)
  }

  for (const target of REMOVE_LIST_ITEMS_LINKING_TO) {
    if (url === target) continue
    // The narrowest <li> that contains the anchor and no other <li>.
    const escaped = target.replace(/[.*+?^()|[\]\\/{}$]/g, '\\$&')
    const re = new RegExp('<li\\b(?:(?!<li\\b)[\\s\\S])*?href="' + escaped + '"(?:(?!<li\\b)[\\s\\S])*?</li>', 'g')
    const before = html
    html = html.replace(re, '')
    if (html !== before) bump('listItemsRemoved', (before.length - html.length) > 0 ? 1 : 0)
  }

  if (DEMOTE_PASTED_H1.has(url)) {
    let n = 0
    html = html.replace(/<h1(\s+data-start="[^"]*"\s+data-end="[^"]*")>([\s\S]*?)<\/h1>/gi, (m, attrs, inner) => { n++; return `<h2>${inner}</h2>` })
    if (n) bump('h1sDemoted', n); else miss('no pasted <h1 data-start> found')
  }

  // Only page-specific edits count as a content change worth a new lastmod.
  // The site-wide link and brand-casing swaps are not.
  if (html !== original && (TITLES[url] || DESCRIPTIONS[url] || H1[url] || REPLACEMENTS[url] || DEMOTE_PASTED_H1.has(url))) {
    doc.edited = EDIT_DATE
    bump('pagesEdited')
  }

  doc.html = html
}
