/**
 * Schema, canonicals, indexability and social-image URLs.
 *
 * WHAT THE MIRROR SHIPS, AND WHY IT IS NOT ENOUGH
 * ----------------------------------------------
 * Yoast writes a graph on every page -- WebSite, WebPage, BreadcrumbList,
 * Article on posts -- and not one node says what the business is, where it is,
 * or how to phone it. There is no Organization, no LocalBusiness, no address,
 * no telephone anywhere in 426 pages. For a local trade that is the single
 * biggest structured-data hole there is: Google's local understanding of the
 * entity comes from exactly this node plus the Business Profile.
 *
 * This module adds one RoofingContractor node (LocalBusiness >
 * HomeAndConstructionBusiness > RoofingContractor, the most specific real type
 * on schema.org for this trade) and wires it into Yoast's graph as the
 * WebSite's publisher, so it is one connected graph rather than two blocks that
 * happen to share a page.
 *
 * EVERY FACT IN THE NODE WAS READ OFF THE SITE ITSELF. Address and phone from
 * /contact/, coordinates from the Google Maps embed the site carries, socials
 * from the footer links, founding year and owner from the About/footer copy.
 * Opening hours are stated nowhere on the site, so none are written -- a guess
 * here would be a false promise to someone with water coming through a ceiling.
 * No aggregateRating and no review markup, ever: Google's review-snippet rules
 * make a business that marks up its own reviews ineligible for the star
 * feature, and it is pointless besides -- stars come from the Business Profile.
 *
 * The declutter pass turned absolute https://inthelightroofing.com/wp-content/
 * URLs into root-relative /assets/ ones. Right for <img>, wrong for og:image,
 * twitter:image and JSON-LD image fields, which must be absolute; this puts the
 * live domain back on those.
 *
 * Canonicals: /services/asphalt-shingle-roofing/ canonicalised into a blog
 * category archive, handing its ranking to a page whose H1 is "Blog"; it is
 * made self-canonical. Three near-duplicates (a campaign copy of roof repairs
 * and two saved homepage drafts) are declared as duplicates of their masters
 * and kept out of the index.
 */
import {
  SITE, absolutize, getYoastGraph, replaceJsonLd, addJsonLd, getCanonical, setCanonical, setIndexable,
  getMeta, setMeta, getTitle,
} from './lib.mjs'

const ORG_ID = `${SITE}/#organization`
const LOGO_ID = `${SITE}/#logo`

/* Read off /contact/, the footer and the About page. See the header comment. */
const BUSINESS = {
  name: 'In the Light Roofing',
  alternateName: 'In The Light Roofing',
  telephone: '+1-484-553-0213',
  email: 'info@inthelightroofing.com',
  street: '871 N Fenwick St',
  locality: 'Allentown',
  region: 'PA',
  postalCode: '18109',
  country: 'US',
  lat: 40.62184923270019,
  lng: -75.44724580028523,
  map: 'https://maps.app.goo.gl/Jp6StBjJ9B6f7mDQ9',
  founded: '2017',
  founder: 'Bryson Berard',
  logo: '/assets/2023/12/header-logo1.webp',
  logoW: 562,
  logoH: 225,
  sameAs: [
    'https://www.facebook.com/InthelightcontractingLLC/',
    'https://www.instagram.com/inthelightroofing/',
    'https://www.youtube.com/@inthelightroofing',
    'https://maps.app.goo.gl/Jp6StBjJ9B6f7mDQ9',
  ],
}

/* The towns with their own /service-area/ page, plus the region. Nothing else:
   areaServed is a claim, and these are the ones the site already makes. */
const TOWNS = ['Allentown', 'Bethlehem', 'Easton', 'Center Valley', 'Whitehall', 'Macungie',
  'Northampton', 'Catasauqua', 'Coplay', 'Slatington', 'Walnutport']

/* The services the navigation offers. serviceType is the buyer's phrase. */
export const SERVICES = [
  { url: '/services/roof-repairs/', name: 'Roof Repairs', type: 'Roof repair' },
  { url: '/services/roof-replacement/', name: 'Roof Replacement', type: 'Roof replacement' },
  { url: '/services/new-roof-installation/', name: 'New Roof Installation', type: 'New roof installation' },
  { url: '/services/roof-inspections/', name: 'Roof Inspections', type: 'Roof inspection' },
  { url: '/services/storm-damage-repair/', name: 'Storm Damage Repair', type: 'Storm damage roof repair' },
  { url: '/services/insurance-claim-facilitation/', name: 'Insurance Claim Facilitation', type: 'Roof insurance claim assistance' },
  { url: '/services/asphalt-shingle-roofing/', name: 'Asphalt Shingle Roofing', type: 'Asphalt shingle roofing' },
  { url: '/services/epdm-rubber-roofing/', name: 'EPDM Rubber Roofing', type: 'EPDM flat roofing' },
]

/* Near-duplicates: declared as copies of their master and kept out of the index.
   /services/roof-repairs-campaign/ is a same-title twin of roof repairs with no
   canonical of its own; /home/ and /home-in-the-light-roofing-new-design/ are
   saved drafts of the homepage that carry its exact title. */
const DUPLICATE_OF = {
  '/services/roof-repairs-campaign/': '/services/roof-repairs/',
  '/home/': '/',
  '/home-in-the-light-roofing-new-design/': '/',
}

/* Pages whose canonical currently points somewhere it should not. */
const FORCE_SELF_CANONICAL = new Set(['/services/asphalt-shingle-roofing/'])

/* Utility pages nobody should land on from a search result. /thank-you/ is the
   form confirmation and carries the blog's title and description verbatim. */
const NOINDEX = new Set(['/thank-you/'])

/* Descriptions for pages that have none and are not covered by the content
   pass. Written from what the page itself shows. */
const DESCRIPTIONS = {
  '/testimonial/': 'Read what homeowners across the Lehigh Valley say about working with In the Light Roofing on roof repairs, replacements, inspections and insurance claims.',
}

function areaServed() {
  return [
    { '@type': 'AdministrativeArea', name: 'Lehigh Valley, PA' },
    ...TOWNS.map((t) => ({ '@type': 'City', name: `${t}, PA` })),
  ]
}

function organizationNode() {
  return {
    '@type': ['RoofingContractor', 'LocalBusiness'],
    '@id': ORG_ID,
    name: BUSINESS.name,
    alternateName: BUSINESS.alternateName,
    // As registered: the BBB profile reads "In The Light Roofing, LLC" at this
    // address and number, and the Facebook page slug is InthelightcontractingLLC.
    legalName: 'In The Light Roofing, LLC',
    url: `${SITE}/`,
    logo: { '@id': LOGO_ID },
    image: { '@id': LOGO_ID },
    telephone: BUSINESS.telephone,
    email: BUSINESS.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: BUSINESS.street,
      addressLocality: BUSINESS.locality,
      addressRegion: BUSINESS.region,
      postalCode: BUSINESS.postalCode,
      addressCountry: BUSINESS.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: BUSINESS.lat, longitude: BUSINESS.lng },
    hasMap: BUSINESS.map,
    foundingDate: BUSINESS.founded,
    founder: { '@type': 'Person', name: BUSINESS.founder, jobTitle: 'Owner' },
    areaServed: areaServed(),
    sameAs: BUSINESS.sameAs,
    makesOffer: SERVICES.map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', '@id': `${SITE}${s.url}#service`, name: s.name, serviceType: s.type, url: `${SITE}${s.url}` },
    })),
  }
}

function logoNode() {
  return {
    '@type': 'ImageObject',
    '@id': LOGO_ID,
    inLanguage: 'en-US',
    url: absolutize(BUSINESS.logo),
    contentUrl: absolutize(BUSINESS.logo),
    width: BUSINESS.logoW,
    height: BUSINESS.logoH,
    caption: BUSINESS.name,
  }
}

function serviceNode(svc, description) {
  return {
    '@type': 'Service',
    '@id': `${SITE}${svc.url}#service`,
    name: svc.name,
    serviceType: svc.type,
    url: `${SITE}${svc.url}`,
    ...(description ? { description } : {}),
    provider: { '@id': ORG_ID },
    areaServed: areaServed(),
  }
}

/** Walk a JSON-LD node and put the live domain back on root-relative URL fields. */
function absolutizeNode(n, count) {
  if (Array.isArray(n)) { n.forEach((x) => absolutizeNode(x, count)); return }
  if (!n || typeof n !== 'object') return
  for (const k of Object.keys(n)) {
    const v = n[k]
    if (typeof v === 'string') {
      if (['url', 'contentUrl', 'thumbnailUrl', 'image', 'logo', 'item', 'target'].includes(k) && v.startsWith('/') && !v.startsWith('//')) {
        n[k] = absolutize(v); count.n++
      }
    } else absolutizeNode(v, count)
  }
}

export async function transformDoc(doc, ctx) {
  const rep = ctx.report.meta
  const bump = (k, by = 1) => { rep[k] = (rep[k] || 0) + by }
  let html = doc.html
  const url = doc.url

  /* 1. Social images and URLs back to absolute. */
  for (const key of ['og:image', 'og:image:secure_url', 'twitter:image', 'og:url']) {
    const v = getMeta(html, key)
    if (v && v.startsWith('/') && !v.startsWith('//')) { html = setMeta(html, key, absolutize(v)); bump('absolutizedMeta') }
  }

  /* 2. The graph. */
  const y = getYoastGraph(html)
  if (y) {
    const { graph } = y
    const count = { n: 0 }
    absolutizeNode(graph, count)
    if (count.n) bump('absolutizedJsonLd', count.n)

    const types = new Set(graph.flatMap((n) => [].concat(n['@type'] || [])))
    doc.kind = types.has('Article') ? 'post' : types.has('CollectionPage') ? 'archive'
      : url.startsWith('/testimonial/') ? 'testimonial' : 'page'

    if (!graph.some((n) => n['@id'] === ORG_ID)) {
      graph.push(organizationNode(), logoNode())
      bump('organizationNodes')
    }
    const website = graph.find((n) => n['@type'] === 'WebSite')
    if (website && !website.publisher) website.publisher = { '@id': ORG_ID }
    const webpage = graph.find((n) => n['@type'] === 'WebPage' || (Array.isArray(n['@type']) && n['@type'].includes('WebPage')))
    if (url === '/' && webpage && !webpage.about) webpage.about = { '@id': ORG_ID }

    const svc = SERVICES.find((s) => s.url === url)
    if (svc && !graph.some((n) => n['@type'] === 'Service')) {
      graph.push(serviceNode(svc, getMeta(html, 'description') || undefined))
      if (webpage && !webpage.about) webpage.about = { '@id': `${SITE}${svc.url}#service` }
      bump('serviceNodes')
    }
    html = replaceJsonLd(html, y.block, y.data)
  } else {
    // A page with no Yoast graph at all still gets the business node.
    doc.kind = url.startsWith('/testimonial/') ? 'testimonial' : 'page'
    html = addJsonLd(html, { '@context': 'https://schema.org', '@graph': [organizationNode(), logoNode()] })
    bump('organizationNodes')
  }

  /* 3. Canonicals and indexability. */
  if (DUPLICATE_OF[url]) {
    html = setCanonical(html, `${SITE}${DUPLICATE_OF[url]}`)
    html = setIndexable(html, false)
    bump('duplicatesDeclared')
  } else if (FORCE_SELF_CANONICAL.has(url) || !getCanonical(html)) {
    const cur = getCanonical(html)
    if (cur !== `${SITE}${url}`) { html = setCanonical(html, `${SITE}${url}`); bump('canonicalsFixed') }
  }

  /* The blog archives. Nineteen category URLs, their pagination and /roofing/
     all render the identical eighteen posts under the H1 "Blog" -- one broken
     Elementor archive template, not nineteen pages of content. Yoast already
     keeps the tag and blog-pagination archives out of the index; this extends
     that to the rest, leaving /blog/ and /testimonial/ as the two real hubs.
     A single testimonial page is one quote under the customer's name as the
     title; it stays crawlable (the quotes are real and linked) but out of the
     index, where it could only compete with the pages that sell the work. */
  const HUBS = new Set(['/blog/', '/testimonial/'])
  const thin = (doc.kind === 'archive' && !HUBS.has(url)) || (doc.kind === 'testimonial' && !HUBS.has(url))
  if ((thin || NOINDEX.has(url)) && !/noindex/i.test(getMeta(html, 'robots'))) {
    html = setIndexable(html, false)
    bump(NOINDEX.has(url) ? 'utilityNoindexed' : doc.kind === 'archive' ? 'archivesNoindexed' : 'testimonialsNoindexed')
  }

  if (DESCRIPTIONS[url] && !getMeta(html, 'description')) {
    html = setMeta(html, 'description', DESCRIPTIONS[url])
    if (!getMeta(html, 'og:description')) html = setMeta(html, 'og:description', DESCRIPTIONS[url])
    bump('descriptionsAdded')
  }

  /* 4. Yoast writes og:type "article" on every page; a service or town page is a web page. */
  if (doc.kind === 'page' && getMeta(html, 'og:type') === 'article') html = setMeta(html, 'og:type', 'website')

  doc.html = html
}
