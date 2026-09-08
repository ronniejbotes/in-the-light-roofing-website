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

/**
 * Yoast gave the blog archive an og:title of the bare word "Blog" while its
 * <title> is the real one, so anyone sharing /blog/ or any of its nineteen
 * paginated pages posts a card headed "Blog". The sync above rewrites og:title,
 * twitter:title and the WebPage name from TITLES, so naming these pages here is
 * the whole fix. The paginated pages take the archive's title because they are
 * the same list of posts and meta.mjs has already marked them noindex, and the
 * casing follows the brand's own: "In The Light Roofing", not "In the". The
 * superlative in the old title ("Best Roofing Tips") goes for the same reason
 * "leading" and "#1" went everywhere else: nothing on the site supports it.
 */
const BLOG_ARCHIVE_TITLE = 'In The Light Roofing Blog | Roofing Tips & Insights'
TITLES['/blog/'] = BLOG_ARCHIVE_TITLE
for (let page = 2; page <= 20; page++) TITLES[`/blog/page/${page}/`] = BLOG_ARCHIVE_TITLE

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
  // Valley, the body Center Valley. The brand link that follows is kept. The
  // second edit is the banner heading described below.
  '/services/roof-inspections/': [
    { find: 'In Center Valley, <a href="https://g.co/kgs/upMJXvq"', replace: 'In Allentown and across the Lehigh Valley, <a href="https://g.co/kgs/upMJXvq"' },
    { find: '<p class="elementor-heading-title elementor-size-default">Get a No Cost ROOf REPLACEMENT Estimate</p>',
      replace: '<p class="elementor-heading-title elementor-size-default" role="heading" aria-level="2">Get a No Cost Estimate</p>' },
  ],
  // The banner form's heading asks for a roof REPLACEMENT estimate on three
  // pages that sell something else, so the reader is offered the wrong thing at
  // the moment they are ready to act. The site's own neutral wording, "Get a No
  // Cost Estimate", is already the heading of the second form on all 424 pages,
  // so reusing it here promises nothing new. It has to be that rather than a
  // free inspection: the FAQ on the site says inspections may come with a fee.
  // These run before GLOBAL_REPLACEMENTS, so the site-wide casing fix below
  // finds nothing left to do on these three pages, which is the intent.
  '/services/roof-repairs/': [
    { find: '<p class="elementor-heading-title elementor-size-default">Get a No Cost ROOf REPLACEMENT Estimate</p>',
      replace: '<p class="elementor-heading-title elementor-size-default" role="heading" aria-level="2">Get a No Cost Estimate</p>' },
  ],
  '/services/insurance-claim-facilitation/': [
    { find: '<p class="elementor-heading-title elementor-size-default">Get a No Cost ROOf REPLACEMENT Estimate</p>',
      replace: '<p class="elementor-heading-title elementor-size-default" role="heading" aria-level="2">Get a No Cost Estimate</p>' },
  ],
  // The address block on the contact page is the only place on the site that
  // punctuates the street as "871 N Fenwick St." and then breaks the line, so
  // it renders as "871 N Fenwick St. Allentown, PA 18109" while the other 423
  // pages, the JSON-LD in meta.mjs and the NAP block in nap.mjs all say
  // "871 N Fenwick St, Allentown, PA 18109". The page carrying the real address
  // is the one that should not be the odd one out.
  '/contact/': [
    { find: '871 N Fenwick St.\nAllentown, PA 18109</p>', replace: '871 N Fenwick St, Allentown, PA 18109</p>' },
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
  // The other 2,123 click-to-call links write the number as ten bare digits
  // with no country code, so the site ships three spellings of one number. The
  // E.164 form is the one the entry above produces and the one the JSON-LD
  // telephone property in meta.mjs carries, so it is the spelling everything
  // else is made to agree with. The Bethlehem page's tel:4849789366 is left
  // alone on purpose: see the note on REPLACEMENTS above.
  ['href="tel:4845530213"', 'href="tel:+14845530213"'],
  // One post states an availability the site nowhere else claims and the owner
  // has not confirmed. The repair claim stands; the hours claim goes.
  ['we offer 24/7 emergency services and expert <b>Storm Damage Repair</b> throughout Allentown', 'we offer expert <b>Storm Damage Repair</b> throughout Allentown'],
  // The boilerplate FAQ's first answer lost its full stop on 21 pages; the
  // Coplay variant has a space before a comma.
  ['scope and costs</div>', 'scope and costs.</div>'],
  ['commercial roofing , particularly', 'commercial roofing, particularly'],
  // Every one of the 424 pages carries a skip link to "#content", but only the
  // 16 testimonial pages ship a <main id="content"> for it to land on. The
  // other 408 open their content with an Elementor wrapper div immediately
  // after </header>, so the skip link goes nowhere and a screen reader is given
  // no main landmark to jump to. Putting the id and role="main" on that div
  // fixes both without moving any content: the div already closes before the
  // footer, it sits outside the header so it nests inside no other landmark,
  // and the only "#content" rules in the CSS are WooCommerce product-grid
  // descendants of a widget class that appears nowhere in this site's markup,
  // so nothing restyles. The 16 pages that already have the landmark are not
  // matched by any of these finds, so no page ends up with two.
  ['</header><div data-elementor-type="single-post"', '</header><div id="content" role="main" data-elementor-type="single-post"'],
  ['</header><div data-elementor-type="archive"', '</header><div id="content" role="main" data-elementor-type="archive"'],
  // Declutter renames wp- to ui- before this pass runs, so the page wrapper is
  // "ui-page" here even though the mirror stores it as "wp-page".
  ['</header><div data-elementor-type="ui-page"', '</header><div id="content" role="main" data-elementor-type="ui-page"'],
  // Forminator renders the phone field as type="text" with autocomplete="off",
  // so a number the browser already knows is never offered and a phone gets the
  // alphabet keyboard for a field that only takes digits. autocomplete="tel"
  // restores the autofill and inputmode="numeric" brings up the number pad. The
  // type stays "text" on purpose: Forminator's two phone rules,
  // forminatorPhoneNational and forminatorPhoneInternational, both start with
  // intlTelInput.getInstance(), and intlTelInput is only initialised for fields
  // carrying a national_mode data attribute, which no page here has. Switching
  // to type="tel" would therefore change no validation at all while changing
  // markup the plugin itself writes, so it buys nothing and risks something.
  // These two shapes occur only on .forminator-field--phone inputs; the other
  // autocomplete="off" on each page belongs to CleanTalk's hidden honeypot,
  // which needs to keep it.
  ['data-required="" aria-required="false" autocomplete="off"', 'data-required="" aria-required="false" autocomplete="tel" inputmode="numeric"'],
  ['data-required="1" aria-required="true" autocomplete="off"', 'data-required="1" aria-required="true" autocomplete="tel" inputmode="numeric"'],
  // The heading over the primary conversion form is a <p>, so the one line that
  // says what the form is for cannot be reached by anyone navigating the page
  // by heading. It cannot simply become an <h2>: seven responsive rules in the
  // theme's CSS are written as ".bnr-title p.elementor-heading-title{font-size:
  // ..px!important}", and changing the tag would leave the line at its desktop
  // 24px on a phone instead of the 20px it is meant to be. role="heading" with
  // aria-level="2" gives assistive technology the heading and leaves all seven
  // rules matching. Level 2 is the right level: on the posts and on the service
  // pages alike this banner sits among h2 siblings. The stray capital in "ROOf"
  // never reached a visitor, because the widget's CSS uppercases the whole
  // line, but the source should still read as English.
  ['<p class="elementor-heading-title elementor-size-default">Get a No Cost ROOf REPLACEMENT Estimate</p>', '<p class="elementor-heading-title elementor-size-default" role="heading" aria-level="2">Get a No Cost Roof Replacement Estimate</p>'],
  // Two review badges in the header print counts that nothing keeps current:
  // 237 for Google and 18 for Facebook, on all 424 pages, alongside the 232 and
  // the 39 the same header used to carry elsewhere. The house rule, set by
  // overrides/reviews.js and by the "4.9 rating of 39 reviews" edit in
  // edits.json, is to drop the number rather than swap in another one that will
  // rot the same way. The star image, the badge and the link to each listing
  // all stay; only the count goes, and the label now says where the link leads.
  ['Based on 237 Reviews', 'Read Our Google Reviews'],
  ['Based on 18 Reviews', 'Read Our Facebook Reviews'],
  // Yoast cut the spring post's title off mid-phrase, and the truncated string
  // was then copied into the og:title, the JSON-LD headline, the BreadcrumbList
  // name and the H1 on that post, plus five "Related Posts" labels on other
  // pages: nine places all ending "... Key Steps for Spring Roof". "Spring Roof
  // Maintenance" is already an H2 twice on that page and one of its tags, so
  // finishing the phrase states nothing the page does not already state.
  ['Preparing Your Roof for Spring in Pennsylvania: Key Steps for Spring Roof', 'Preparing Your Roof for Spring in Pennsylvania: Key Steps for Spring Roof Maintenance'],
  // The four spun posts whose bodies edits.json now replaces outright had their
  // first sentence copied into the post excerpt, and the excerpt is what the
  // Essential Addons grid prints on every archive: /blog/ and its paginated
  // pages, every /tag/ and every category listing, 182 pages in all, one card
  // each. Replacing the body alone would leave the keyword-first spun sentence
  // ("<keyword> works best when the decision begins with observed conditions")
  // on all 182 while the post itself read differently. The old excerpt is a
  // truncation ending in an ellipsis, so the find carries the trailing dots and
  // cannot collide with the body sentence it was cut from; the replacement is
  // the post's real opening sentence, which reads whole rather than cut off.
  ['storm damage roof checklist Lehigh Valley works best when the decision begins with observed conditions rather than assumptions. Owners often see a symptom and jump directly to a product, repair or proposal....', 'Storms move through the Lehigh Valley faster than most homeowners expect, and what they leave behind is rarely as obvious as a hole in the roof.'],
  ['spring roof inspection Lehigh Valley works best when the decision begins with observed conditions rather than assumptions. Owners often see a symptom and jump directly to a product, repair or proposal. A...', 'Winter in the Lehigh Valley rarely leaves a roof exactly the way it found it.'],
  ['roof repair or replacement Allentown works best when the decision begins with observed conditions rather than assumptions. Owners often see a symptom and jump directly to a product, repair or proposal. A...', 'Deciding between a roof repair and a full replacement is one of the larger calls an Allentown homeowner has to make, and it almost never arrives at a convenient moment.'],
  ['Lehigh Valley roof ice dam prevention works best when the decision begins with observed conditions rather than assumptions. Owners often see a symptom and jump directly to a product, repair or proposal....', 'Ice dams are one of the few roof problems in the Lehigh Valley that build slowly enough to stop before they ever reach your ceiling.'],
  // Four posts ship the SEO contractor's WordPress username as their author
  // while the other 188 say "Admin". meta.mjs has already re-attributed every
  // post's JSON-LD author to the organization, so this tag is the last place a
  // third-party account name is printed. It joins the other 188.
  ['<meta name="author" content="SEODev2" />', '<meta name="author" content="Admin" />'],
  // The ice-dam post's editorial title changes with its rewritten body, and the
  // old wording is the same string in six places on its own page -- title,
  // og:title, the Article headline, the WebPage name, the breadcrumb and the H1
  // -- plus 365 "Related Posts" and archive-card labels across 183 other pages.
  // TITLES above rewrites the head; this carries the H1, the schema and every
  // off-page label with it, so no page ends up naming the post two ways.
  ['Lehigh Valley Roof Ice Dam Prevention for Homeowners', 'Lehigh Valley Roof Ice Dam Prevention: Start in the Attic'],
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
