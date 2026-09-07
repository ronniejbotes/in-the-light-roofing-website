/**
 * Internal linking: related-pages blocks and page-specific FAQs.
 *
 * The site's service pages, town pages and posts reach each other almost only
 * through the site-wide navigation. A service page does not link to the towns
 * it is offered in; a town page does not link to the services; a post about
 * roof inspections does not link down to the inspections service. Crawlers and
 * readers both follow in-body links, and a page with none is a dead end.
 *
 * RELATED BLOCK -- one per page, just above the footer, built by rules rather
 * than by hand so all 192 posts get one:
 *   service page -> three sibling services, four towns, two matching posts
 *   town page    -> the six core services, plus any post naming the town
 *   hub page     -> its children (services, towns, materials)
 *   post         -> the service it is about, the town it names, two siblings
 * Every target is checked against the published tree; a link to nothing is
 * never written.
 *
 * FAQ BLOCK -- on the eight service pages, the roof-types hub, Allentown and
 * Contact: questions a buyer actually types, answered from what the site
 * already says, with the source noted in the data. No warranty years, no
 * lifespans, no code citations, no availability -- those are unverified or
 * gated. Plain HTML, no FAQPage schema: Google retired the FAQ rich result in
 * 2026, and the value is in the answer being on the page.
 *
 * Styled by overrides/links.css.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { listDocs, escapeHtml, escapeAttr, insertBeforeBodyEnd, getTitle, addJsonLd, SITE } from './lib.mjs'

/**
 * The trust strip on service and town pages: four facts the site already
 * states, each with its source. Competitors carry a "why choose us" block on
 * every money page; ours had the facts on the homepage and footer only.
 * Nothing gated: no warranty terms, no certification, no availability.
 */
const TRUST = [
  { k: 'Locally owned since 2017', v: 'Bryson Berard opened In The Light Roofing in 2017 and still runs it.', src: 'footer and About copy' },
  { k: 'Based in Allentown', v: 'Our office is at 871 N Fenwick St, Allentown, PA 18109, serving the whole Lehigh Valley.', src: '/contact/' },
  { k: 'No-cost project estimates', v: 'Estimates are free. A written outline of the work before you commit to anything.', src: 'site-wide FAQ and the estimate button' },
  { k: 'Hablamos español', v: 'Call or email and we will arrange your estimate in Spanish.', src: 'hero and footer' },
]
const TRUST_REVIEWS = [
  { label: 'Google', url: 'https://g.co/kgs/upMJXvq' },
  { label: 'Facebook', url: 'https://www.facebook.com/InthelightcontractingLLC/reviews' },
  { label: 'BBB', url: 'https://www.bbb.org/us/pa/allentown/profile/roofing-contractors/in-the-light-roofing-llc-0241-236020858' },
]

/* ------------------------------------------------------------------ data */

const SERVICES = {
  '/services/roof-repairs/': { label: 'Roof Repair', text: 'Leaks, damaged shingles, sagging decking and granule loss, repaired before they spread.', key: /repair|leak/ },
  '/services/roof-replacement/': { label: 'Roof Replacement', text: 'A full replacement when a roof has reached the end of its life or the damage is too extensive to repair.', key: /replac/ },
  '/services/new-roof-installation/': { label: 'New Roof Installation', text: 'The first roof on a new build or addition, in asphalt shingle.', key: /install/ },
  '/services/roof-inspections/': { label: 'Roof Inspections', text: 'Exterior, attic and interior checked, with a written report of what we found.', key: /inspect/ },
  '/services/storm-damage-repair/': { label: 'Storm Damage Repair', text: 'Missing shingles, water stains and fallen limbs after a storm, and help with the insurance claim.', key: /storm|hail|wind|emergency/ },
  '/services/insurance-claim-facilitation/': { label: 'Roof Insurance Claim Help', text: 'Documentation and photos your insurer will ask for, and plain-language guidance through the claim.', key: /insurance|claim/ },
  '/services/asphalt-shingle-roofing/': { label: 'Asphalt Shingle Roofing', text: 'The most common pitched-roof material in the Lehigh Valley, in a range of styles and colors.', key: /shingle|asphalt/ },
  '/services/epdm-rubber-roofing/': { label: 'Commercial Flat Roofing (EPDM)', text: 'EPDM rubber membrane for flat and low-slope commercial roofs: installation, repair and maintenance.', key: /epdm|flat|commercial|rubber/ },
}
const CORE = ['/services/roof-repairs/', '/services/roof-replacement/', '/services/new-roof-installation/', '/services/roof-inspections/', '/services/storm-damage-repair/', '/services/insurance-claim-facilitation/']

/* Posts whose slug names no service still have an obvious home: cost and
   price content belongs with replacement (the keyword map's call), material
   and design pieces with asphalt shingle, and the seasonal / maintenance /
   energy pieces with inspections, which is what they all end by recommending. */
const THEME_KEYS = [
  [/cost|price|afford|budget|financ/, '/services/roof-replacement/'],
  [/material|design|curb-appeal|green-roof|solar|color|shingle/, '/services/asphalt-shingle-roofing/'],
  [/energy|efficien|ventilat|insulat|attic|condensation|ice-dam|winter|summer|humid|heat|weather|season|maintenance|lifespan|extend|algae|mold|gutter|snow/, '/services/roof-inspections/'],
]
const SIBLINGS = {
  '/services/roof-repairs/': ['/services/storm-damage-repair/', '/services/roof-inspections/', '/services/roof-replacement/'],
  '/services/roof-replacement/': ['/services/asphalt-shingle-roofing/', '/services/new-roof-installation/', '/services/roof-inspections/'],
  '/services/new-roof-installation/': ['/services/roof-replacement/', '/services/asphalt-shingle-roofing/', '/services/roof-inspections/'],
  '/services/roof-inspections/': ['/services/roof-repairs/', '/services/storm-damage-repair/', '/services/insurance-claim-facilitation/'],
  '/services/storm-damage-repair/': ['/services/insurance-claim-facilitation/', '/services/roof-repairs/', '/services/roof-inspections/'],
  '/services/insurance-claim-facilitation/': ['/services/storm-damage-repair/', '/services/roof-inspections/', '/services/roof-replacement/'],
  '/services/asphalt-shingle-roofing/': ['/services/roof-replacement/', '/services/new-roof-installation/', '/services/epdm-rubber-roofing/'],
  '/services/epdm-rubber-roofing/': ['/services/roof-inspections/', '/services/roof-repairs/', '/services/asphalt-shingle-roofing/'],
}

const TOWNS = {
  '/service-area/allentown/': { name: 'Allentown', slug: 'allentown' },
  '/service-area/roofers-bethlehem-pa/': { name: 'Bethlehem', slug: 'bethlehem' },
  '/service-area/easton/': { name: 'Easton', slug: 'easton' },
  '/service-area/center-valley-roofing-contractor/': { name: 'Center Valley', slug: 'center-valley' },
  '/service-area/whitehall/': { name: 'Whitehall', slug: 'whitehall' },
  '/service-area/macungie/': { name: 'Macungie', slug: 'macungie' },
  '/service-area/northampton/': { name: 'Northampton', slug: 'northampton' },
  '/service-area/catasauqua/': { name: 'Catasauqua', slug: 'catasauqua' },
  '/service-area/coplay/': { name: 'Coplay', slug: 'coplay' },
  '/service-area/slatington/': { name: 'Slatington', slug: 'slatington' },
  '/service-area/walnutport/': { name: 'Walnutport', slug: 'walnutport' },
  '/service-area/lehigh-valley/': { name: 'the Lehigh Valley', slug: 'lehigh-valley' },
}
const TOP_TOWNS = ['/service-area/allentown/', '/service-area/roofers-bethlehem-pa/', '/service-area/easton/', '/service-area/center-valley-roofing-contractor/']

const townLink = (url) => ({ url, label: `Roofing in ${TOWNS[url].name.replace(/^the /, 'the ')}, PA`.replace('the Lehigh Valley, PA', 'the Lehigh Valley'), text: `Roof repair, replacement, inspections and storm damage repair for homes in ${TOWNS[url].name}.` })
const svcLink = (url, town) => ({ url, label: SERVICES[url].label, text: town ? `${SERVICES[url].label} for homes in ${town}, from our Allentown office.` : SERVICES[url].text })

/**
 * Questions and answers, per page. Every answer paraphrases content already on
 * the site; `src` records where. Nothing here states a number, a duration, a
 * warranty term, an availability or a certification.
 */
const FAQS = {
  '/services/roof-repairs/': { heading: 'Questions about roof repair', items: [
    { q: 'What are the signs my roof needs repair rather than replacement?', a: 'Watch for water stains on ceilings or walls, cracked or curled shingles, a sagging section of roof deck, and shingle granules collecting in your gutters. One or two of these on an otherwise sound roof usually means a repair; several at once on an aging roof points toward replacement, and an inspection will tell you which.', src: '/services/roof-repairs/ and /services/roof-replacement/ section headings' },
    { q: 'Do you charge for a roof repair estimate?', a: 'No. Estimates are free and give you a written outline of the cost to fix what is visibly wrong. A full roof inspection is a different service, a detailed assessment of the whole roof and attic, and that carries a fee.', src: 'homepage FAQ: free estimates vs paid inspections' },
    { q: 'Why is my roof leaking around the chimney?', a: 'Most chimney leaks are flashing failures rather than shingle failures. Flashing is the thin metal that seals the joint where the chimney, skylights and vents meet the roof; when it rusts, cracks or pulls away, water runs in behind it. Read more in our guide to <a href="/roof-flashing-failure-signs-solutions/">roof flashing failure</a>.', src: '/roof-flashing-failure-signs-solutions/' },
  ] },
  '/services/roof-replacement/': { heading: 'Questions about roof replacement', items: [
    { q: 'Can I stay in my home while the roof is being replaced?', a: 'Yes. Most roof replacements are done with the family at home. Expect constant hammering and footsteps overhead and some debris falling outside, so cover outdoor furniture, move cars out of the driveway, and plan to spend the day on a lower floor or out of the house. Our post on <a href="/can-you-still-live-in-your-home-while-it-is-being-reroofed/">living at home during a re-roof</a> has the full checklist.', src: '/can-you-still-live-in-your-home-while-it-is-being-reroofed/' },
    { q: 'What does your roof replacement process look like?', a: 'Five steps: an initial call, an on-site appointment, a written estimate, a pre-production visit where the deposit is taken and materials are planned, and production day when the crew tears off the old roof and installs the new one.', src: 'site-wide FAQ and the five-step process section' },
    { q: 'What is the difference between new roof installation and roof replacement?', a: 'New roof installation is the first roof on a newly built home or addition, so there is nothing to tear off. Roof replacement removes an existing roof that has reached the end of its life or has damage too extensive to repair, and installs a new one in its place.', src: '/services/new-roof-installation/ and /services/roof-replacement/' },
  ] },
  '/services/new-roof-installation/': { heading: 'Questions about new roof installation', items: [
    { q: 'What is the difference between new roof installation and roof replacement?', a: 'New roof installation is the first roof on a newly built home or addition, so there is nothing to tear off. <a href="/services/roof-replacement/">Roof replacement</a> removes an existing roof that has reached the end of its life or has damage too extensive to repair, and installs a new one in its place.', src: 'both service pages' },
    { q: 'What does the process look like?', a: 'Five steps: an initial call, an on-site appointment, a written estimate, a pre-production visit where the deposit is taken and materials are planned, and production day.', src: 'site-wide FAQ' },
  ] },
  '/services/roof-inspections/': { heading: 'Questions about roof inspections', items: [
    { q: 'What does a roof inspection include?', a: 'Three parts: a thorough exterior examination for damaged or missing shingles and signs of wear; an attic and interior check for insulation, ventilation, water damage and stains; and a written report with recommendations for any repairs or maintenance.', src: '/services/roof-inspections/ section headings' },
    { q: 'When should I have my roof inspected?', a: 'After any severe weather such as storms, heavy rain or hail; whenever you can see exterior damage such as loose or missing shingles; and as soon as you notice water stains on a ceiling or wall. Many homeowners also book one before buying a house.', src: '/services/roof-inspections/ "Signs You Need a Roof Inspection"' },
    { q: 'Is your roof inspection free?', a: 'The estimate is free; the inspection is not. A free estimate prices the repair or replacement you already know you need. A roof inspection is a paid, top-to-bottom assessment of the exterior, attic and interior that ends in a written report of what we found.', src: 'homepage FAQ on estimates vs inspections' },
    { q: 'Can you inspect my roof for an insurance claim?', a: 'Yes. We inspect the roof and give you a written report and photos that document what we found, which helps you understand what your insurer may ask for. We do not process or negotiate the claim for you.', src: '/services/roof-inspections/ and the Bethlehem page' },
  ] },
  '/services/storm-damage-repair/': { heading: 'Questions about storm damage', items: [
    { q: 'What should I do first after a storm damages my roof?', a: 'Stay off the roof. From the ground, look for missing or cracked shingles, lifted flashing and fallen branches; inside, check ceilings and the attic for drips or stains. Photograph everything you can see, then call your insurer and book an inspection with a local roofer. Do not attempt repairs yourself. Our post on <a href="/steps-after-storm-roof-damage/">what to do after storm damage</a> walks through each step.', src: '/steps-after-storm-roof-damage/ and this page' },
    { q: 'What counts as storm damage on a roof?', a: 'Missing or damaged shingles, new water stains on ceilings or walls after the storm, and impact from fallen debris or tree limbs. Any of these deserves a prompt look, because small openings let water in and turn into bigger repairs.', src: '/services/storm-damage-repair/ "Signs Your Roof Needs Storm Damage Repair"' },
    { q: 'Do you help with the insurance claim after storm damage?', a: 'Yes. We document the damage with photos and a clear written scope and explain what your insurer is likely to need at each step. The claim stays yours: we do not file, process or negotiate it on your behalf. See <a href="/services/insurance-claim-facilitation/">roof insurance claim help</a>.', src: 'site-wide FAQ and the Bethlehem page boundary wording' },
  ] },
  '/services/insurance-claim-facilitation/': { heading: 'Questions about roof insurance claims', items: [
    { q: 'How does a roof insurance claim work?', a: 'You report the damage to your insurer, an adjuster inspects, and the insurer issues a decision and an estimate. Our part is before and around that: documenting the damage with photos and a written scope, explaining the paperwork, and helping you understand what the insurer needs. We do not file or negotiate the claim for you.', src: 'this page and the Bethlehem page' },
    { q: 'Why do roof insurance claims get denied?', a: 'The common reasons are waiting too long to file, weak or missing photo documentation, claiming for wear and tear instead of sudden storm damage, skipping a roofer’s inspection before calling the insurer, making unapproved temporary repairs, and not understanding the deductible and coverage limits. Our post on <a href="/roof-insurance-claim-denial-reasons/">why roof claims are denied</a> covers each.', src: '/roof-insurance-claim-denial-reasons/' },
  ] },
  '/services/asphalt-shingle-roofing/': { heading: 'Questions about asphalt shingle roofing', items: [
    { q: 'Why choose asphalt shingles for a Lehigh Valley home?', a: 'They are the most cost-effective pitched-roof material, come in a wide range of styles and colors to match the house, and are straightforward to install, repair and maintain, which is why they are the most common roof in the Lehigh Valley.', src: 'this page’s section headings and /asphalt-shingles-or-epdm-rubber-roofing/' },
    { q: 'Asphalt shingles or rubber roofing: which does my building need?', a: 'It depends on the roof’s slope. Pitched roofs on homes take asphalt shingles. Flat or low-slope roofs, which means most commercial buildings and some additions and porches, take <a href="/services/epdm-rubber-roofing/">EPDM rubber membrane</a>, because shingles cannot shed water on a flat surface.', src: '/asphalt-shingles-or-epdm-rubber-roofing/' },
  ] },
  '/services/epdm-rubber-roofing/': { heading: 'Questions about commercial flat roofing', items: [
    { q: 'Do you do commercial roofing?', a: 'Yes. Our commercial work is EPDM rubber roofing for flat and low-slope buildings: new installation, repairs and restoration, and routine inspection and maintenance for property owners across the Lehigh Valley.', src: 'homepage FAQ and this page' },
    { q: 'What is EPDM and why is it used on flat roofs?', a: 'EPDM is a synthetic rubber membrane laid in large sheets over a flat or low-slope roof. It resists UV, temperature extremes and standing moisture and needs little maintenance, which suits commercial buildings where shingles cannot work.', src: 'this page’s section headings; flat/low-slope from /asphalt-shingles-or-epdm-rubber-roofing/' },
    { q: 'Do you repair existing rubber roofs or only install new ones?', a: 'Both. We repair and restore existing EPDM roofs, and we run routine inspection and maintenance so small problems are caught before they leak into the building.', src: 'this page' },
  ] },
  '/roof-types/': { heading: 'Questions about roof types', items: [
    { q: 'What roofing materials do you install?', a: 'Two systems: asphalt shingle roofs for homes, and EPDM rubber membrane for flat and low-slope commercial roofs.', src: 'navigation and the Center Valley FAQ' },
    { q: 'Asphalt shingles or rubber roofing: which does my building need?', a: 'It depends on the roof’s slope. Pitched roofs on homes take <a href="/services/asphalt-shingle-roofing/">asphalt shingles</a>. Flat or low-slope roofs take <a href="/services/epdm-rubber-roofing/">EPDM rubber membrane</a>, because shingles cannot shed water on a flat surface.', src: '/asphalt-shingles-or-epdm-rubber-roofing/' },
  ] },
  '/service-area/allentown/': { heading: 'Questions from Allentown homeowners', items: [
    { q: 'Where is In The Light Roofing located?', a: 'We are based at 871 N Fenwick St, Allentown, PA 18109, and have served homeowners across the Lehigh Valley since 2017. Call (484) 553-0213 or email info@inthelightroofing.com.', src: '/contact/ and the footer' },
    { q: 'Should I get a roof inspection before buying a home in Allentown?', a: 'Yes. A roof can look fine from the street while hiding soft decking, cracked shingles, failed flashing or old attic leaks, which is common on older housing stock. A written inspection gives you something concrete to take to the seller. See our guide to <a href="/roof-inspections-home-buying-allentown/">roof inspections when buying in Allentown</a>.', src: '/roof-inspections-home-buying-allentown/' },
  ] },
  '/contact/': { heading: 'Before you call', items: [
    { q: 'Do you speak Spanish?', a: 'Yes. Hablamos español. Call or email and we will arrange your estimate in Spanish.', src: '"Hablamos español" in the hero and footer' },
    { q: 'Is the estimate free?', a: 'Yes. Estimates are free. A full roof inspection is a separate, paid service with a written report.', src: 'homepage FAQ' },
  ] },
}

/* ---------------------------------------------------------------- engine */

let POSTS = []   // { url, title, keys: Set<serviceUrl>, towns: Set<townUrl> }

export async function before(ctx) {
  const docs = await listDocs(ctx.OUT)
  for (const d of docs) {
    const html = await readFile(d.file, 'utf8')
    if (!html.includes('"@type":"Article"')) continue
    const title = getTitle(html).replace(/\s*\|\s*In [Tt]he Light Roofing\s*$/, '').trim()
    const keys = new Set(Object.entries(SERVICES).filter(([, s]) => s.key.test(d.url)).map(([u]) => u))
    if (!keys.size) for (const [re, svc] of THEME_KEYS) if (re.test(d.url)) { keys.add(svc); break }
    const towns = new Set(Object.entries(TOWNS).filter(([, t]) => d.url.includes(t.slug)).map(([u]) => u))
    POSTS.push({ url: d.url, title, keys, towns })
  }
  ctx.report.links.posts = POSTS.length
}

/** Posts about a service, Allentown/Lehigh Valley ones first, deterministic. */
function postsFor(serviceUrl, exclude, n) {
  const pool = POSTS.filter((p) => p.keys.has(serviceUrl) && p.url !== exclude)
  pool.sort((a, b) => (/allentown|lehigh/.test(b.url) ? 1 : 0) - (/allentown|lehigh/.test(a.url) ? 1 : 0) || a.url.localeCompare(b.url))
  return pool.slice(0, n).map((p) => ({ url: p.url, label: p.title, text: '' }))
}

function relatedFor(url) {
  if (SERVICES[url]) {
    return { heading: 'Related roofing services and areas', links: [
      ...SIBLINGS[url].map((u) => svcLink(u)),
      ...TOP_TOWNS.map(townLink),
      ...postsFor(url, url, 2),
    ] }
  }
  if (TOWNS[url]) {
    const town = TOWNS[url].name
    const local = POSTS.filter((p) => p.towns.has(url)).slice(0, 2).map((p) => ({ url: p.url, label: p.title, text: '' }))
    return { heading: `Roofing services in ${town}`, links: [...CORE.map((u) => svcLink(u, town)), ...local] }
  }
  if (url === '/services/') return { heading: 'Every roofing service we offer', links: Object.keys(SERVICES).map((u) => svcLink(u)) }
  if (url === '/service-area/') return { heading: 'Towns we serve across the Lehigh Valley', links: Object.keys(TOWNS).map(townLink) }
  if (url === '/roof-types/') return { heading: 'The two roof systems we install', links: [svcLink('/services/asphalt-shingle-roofing/'), svcLink('/services/epdm-rubber-roofing/'), ...postsFor('/services/asphalt-shingle-roofing/', null, 1), ...postsFor('/services/epdm-rubber-roofing/', null, 1)] }
  const post = POSTS.find((p) => p.url === url)
  if (post) {
    const links = []
    const svc = [...post.keys][0] || '/services/'
    links.push(svc === '/services/' ? { url: '/services/', label: 'Our Roofing Services', text: 'Roof repair, replacement, installation, inspections, storm damage and insurance claim help.' } : svcLink(svc))
    for (const t of [...post.towns].slice(0, 1)) links.push(townLink(t))
    if (svc !== '/services/') links.push(...postsFor(svc, url, 2))
    else {
      // Nothing thematic to pair it with: the reader is a homeowner, so the two
      // pages every homeowner needs, and the town page if the post names one.
      links.push(svcLink('/services/roof-repairs/'), svcLink('/services/roof-inspections/'))
    }
    return { heading: 'Related pages', links: links.slice(0, 4) }
  }
  return null
}

function relatedBlock(spec) {
  const items = spec.links.map((l) =>
    `<li class="itlr-related__item"><a class="itlr-related__link" href="${escapeAttr(l.url)}">`
    + `<span class="itlr-related__label">${escapeHtml(l.label)}</span>`
    + (l.text ? `<span class="itlr-related__text">${escapeHtml(l.text)}</span>` : '')
    + '</a></li>').join('')
  return `<section class="itlr-related" aria-labelledby="itlr-related-h"><div class="itlr-related__inner">`
    + `<h2 class="itlr-related__heading" id="itlr-related-h">${escapeHtml(spec.heading)}</h2>`
    + `<ul class="itlr-related__list">${items}</ul></div></section>`
}

function trustBlock() {
  const items = TRUST.map((t) => `<li class="itlr-trust__item"><strong class="itlr-trust__k">${escapeHtml(t.k)}</strong><span class="itlr-trust__v">${escapeHtml(t.v)}</span></li>`).join('')
  const reviews = TRUST_REVIEWS.map((r) => `<a href="${escapeAttr(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.label)}</a>`).join(', ')
  return `<section class="itlr-trust" aria-labelledby="itlr-trust-h"><div class="itlr-trust__inner">`
    + `<h2 class="itlr-trust__heading" id="itlr-trust-h">Why homeowners across the Lehigh Valley call us</h2>`
    + `<ul class="itlr-trust__list">${items}</ul>`
    + `<p class="itlr-trust__reviews">Read our reviews on ${reviews}.</p></div></section>`
}

/** FAQPage JSON-LD for an injected FAQ block -- text identical to what is on the page. */
function faqSchema(url, spec) {
  const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${SITE}${url}#faq`,
    mainEntity: spec.items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: strip(it.a) },
    })),
  }
}

function faqBlock(spec) {
  // Answers may carry a few <a> tags of our own; everything else is escaped text.
  const items = spec.items.map((it) =>
    `<div class="itlr-faq__item"><h3 class="itlr-faq__q">${escapeHtml(it.q)}</h3><p class="itlr-faq__a">${it.a}</p></div>`).join('')
  return `<section class="itlr-faq" aria-labelledby="itlr-faq-h"><div class="itlr-faq__inner">`
    + `<h2 class="itlr-faq__heading" id="itlr-faq-h">${escapeHtml(spec.heading)}</h2>${items}</div></section>`
}

/** Insert markup before the site footer, or before </body> if there is none. */
function insertBeforeFooter(html, markup) {
  const i = html.search(/<(footer\b|div\b[^>]*data-elementor-type="footer")/i)
  if (i === -1) return insertBeforeBodyEnd(html, markup)
  return html.slice(0, i) + markup + '\n' + html.slice(i)
}

/**
 * The three hubs -- /services/, /service-area/, /roof-types/ -- shared one body
 * (the services copy) and one H1 (the brand name). The H1s are fixed by the
 * content pass; this gives each hub a body of its own, directly under the hero:
 * a short truthful paragraph and the pages it routes to. The related block at
 * the foot is then skipped on these three, so the list is not shown twice.
 */
const HUBS = {
  '/services/': {
    heading: 'Every roofing service we offer',
    intro: 'From our office in Allentown, In The Light Roofing repairs, replaces, installs and inspects roofs across the Lehigh Valley, and helps homeowners through the insurance claim after storm damage. Choose a service to see what it involves.',
    links: () => Object.keys(SERVICES).map((u) => svcLink(u)),
  },
  '/service-area/': {
    heading: 'Towns we serve across the Lehigh Valley',
    intro: 'Based at 871 N Fenwick St in Allentown, we work across the Lehigh Valley. These are the towns with a page of their own; if yours is not listed, call (484) 553-0213 and ask.',
    links: () => Object.keys(TOWNS).map(townLink),
  },
  '/roof-types/': {
    heading: 'The two roof systems we install',
    intro: 'Asphalt shingle for pitched residential roofs, and EPDM rubber membrane for flat and low-slope commercial roofs.',
    links: () => [svcLink('/services/asphalt-shingle-roofing/'), svcLink('/services/epdm-rubber-roofing/')],
  },
}

function hubBlock(spec) {
  const items = spec.links().map((l) =>
    `<li class="itlr-related__item"><a class="itlr-related__link" href="${escapeAttr(l.url)}">`
    + `<span class="itlr-related__label">${escapeHtml(l.label)}</span>`
    + (l.text ? `<span class="itlr-related__text">${escapeHtml(l.text)}</span>` : '')
    + '</a></li>').join('')
  return `<section class="itlr-related itlr-hub" aria-labelledby="itlr-hub-h"><div class="itlr-related__inner">`
    + `<h2 class="itlr-related__heading" id="itlr-hub-h">${escapeHtml(spec.heading)}</h2>`
    + `<p class="itlr-related__intro">${escapeHtml(spec.intro)}</p>`
    + `<ul class="itlr-related__list">${items}</ul></div></section>`
}

/** Insert markup after the hero: before the second top-level Elementor section. */
function insertAfterHero(html, markup) {
  const re = /<section\b[^>]*class="[^"]*elementor-top-section[^"]*"/g
  let m, n = 0
  while ((m = re.exec(html))) { if (++n === 2) return html.slice(0, m.index) + markup + '\n' + html.slice(m.index) }
  return null
}

export async function transformDoc(doc, ctx) {
  const rep = ctx.report.links
  let markup = ''

  if (HUBS[doc.url]) {
    const out = insertAfterHero(doc.html, hubBlock(HUBS[doc.url]))
    if (out) { doc.html = out; rep.hubBlocks = (rep.hubBlocks || 0) + 1 } else (rep.missingTargets ||= []).push(`${doc.url} hub: no second section`)
  }

  if (SERVICES[doc.url] || TOWNS[doc.url]) {
    markup += trustBlock()
    rep.trustBlocks = (rep.trustBlocks || 0) + 1
  }

  const faq = FAQS[doc.url]
  if (faq) {
    // Google retired the FAQ rich result in 2026; this is not a rich-result
    // play. It is valid schema for the answers that are visibly on the page,
    // and other consumers still read it.
    doc.html = addJsonLd(doc.html, faqSchema(doc.url, faq), 'itlr-faq-schema')
    // Every link inside an answer must resolve.
    for (const it of faq.items) for (const m of it.a.matchAll(/href="([^"]+)"/g)) {
      const rel = m[1].replace(/^\//, '').replace(/\/$/, '')
      if (!existsSync(join(ctx.OUT, rel, 'index.html'))) (rep.missingTargets ||= []).push(`${doc.url} FAQ -> ${m[1]}`)
    }
    markup += faqBlock(faq)
    rep.faqBlocks = (rep.faqBlocks || 0) + 1
    rep.faqItems = (rep.faqItems || 0) + faq.items.length
  }

  const spec = HUBS[doc.url] ? null : relatedFor(doc.url)
  if (spec) {
    const ok = []
    for (const l of spec.links) {
      const rel = l.url.replace(/^\//, '').replace(/\/$/, '')
      if (existsSync(join(ctx.OUT, rel === '' ? 'index.html' : join(rel, 'index.html')))) ok.push(l)
      else (rep.missingTargets ||= []).push(`${doc.url} -> ${l.url}`)
    }
    if (ok.length) {
      markup += relatedBlock({ ...spec, links: ok })
      rep.blocks = (rep.blocks || 0) + 1
      rep.links = (rep.links || 0) + ok.length
    }
  }

  if (markup) doc.html = insertBeforeFooter(doc.html, markup)
}
