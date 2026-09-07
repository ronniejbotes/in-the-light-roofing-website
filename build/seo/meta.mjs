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
 * WebSite's publisher, the homepage's subject and every Article's publisher
 * and author, so it is one connected graph rather than two blocks that happen
 * to share a page.
 *
 * EVERY FACT IN THE NODE WAS READ OFF THE SITE OR ITS OWN PROFILES. Address
 * and phone from /contact/, coordinates from the Google Maps embed the site
 * carries, socials from the footer links, founding year and owner from the
 * About copy, the registered name from the BBB profile at the same address
 * and number. Opening hours are stated nowhere on the site, so none are written
 * -- a guess here would be a false promise to someone with water coming
 * through a ceiling. No aggregateRating and no review markup, ever: Google's
 * review-snippet rules make a business that marks up its own reviews
 * ineligible for the star feature, and it is pointless besides -- stars come
 * from the Business Profile.
 *
 * The declutter pass turned absolute https://inthelightroofing.com/wp-content/
 * URLs into root-relative /assets/ ones. Right for <img>, wrong for og:image,
 * twitter:image and JSON-LD image fields, which must be absolute; this puts the
 * live domain back on those.
 *
 * INDEXABILITY -- ONE SIGNAL PER PAGE
 * -----------------------------------
 * A page is either a duplicate (canonical to its master, left indexable so the
 * canonical is the only signal) or thin (noindex, follow, self-canonical), never
 * both: Google treats noindex plus a canonical elsewhere as conflicting and can
 * carry the noindex onto the target. The duplicates are the roof-repairs
 * campaign copy and two saved homepage drafts. The thin pages are the blog
 * archives -- nineteen category URLs, their pagination, /roofing/ and
 * /testimonial/ all render the identical eighteen posts under the H1 "Blog"
 * from one broken archive template -- and the sixteen single-testimonial pages,
 * each one customer quote titled with the customer's name. All stay live and
 * crawlable; none belongs in a search result.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  SITE, absolutize, getYoastGraph, replaceJsonLd, addJsonLd, getCanonical, setCanonical, setIndexable,
  getMeta, setMeta, replaceAll,
} from './lib.mjs'

const ORG_ID = `${SITE}/#organization`
const LOGO_ID = `${SITE}/#logo`

/* Read off /contact/, the footer, the About page and the BBB profile. */
const BUSINESS = {
  // The brand's own casing: the logo, the footer, the BBB listing and the
  // homepage title all write "The". Yoast's site name and most post titles
  // had "the"; content.mjs brings those into line.
  name: 'In The Light Roofing',
  alternateName: 'In the Light Roofing',
  legalName: 'In The Light Roofing, LLC',
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
  // A square PNG for the logo slot -- what a knowledge panel actually uses --
  // and the wide header mark as the image.
  logo: '/assets/2023/12/cropped-header-logo-192x192.png',
  logoW: 192,
  logoH: 192,
  image: '/assets/2023/12/header-logo1.webp',
  sameAs: [
    'https://www.facebook.com/InthelightcontractingLLC/',
    'https://www.instagram.com/inthelightroofing/',
    'https://www.youtube.com/@inthelightroofing',
    'https://www.bbb.org/us/pa/allentown/profile/roofing-contractors/in-the-light-roofing-llc-0241-236020858',
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

/* Exact duplicates: canonical to the master, and nothing else. The campaign
   page arrived as noindex,nofollow with no canonical; it becomes index,follow
   so the canonical is the one signal. publish.mjs also 301s the two homepage
   drafts, so on the live host these two are never served at all. */
const DUPLICATE_OF = {
  '/services/roof-repairs-campaign/': '/services/roof-repairs/',
  '/home/': '/',
  '/home-in-the-light-roofing-new-design/': '/',
}

/* /services/asphalt-shingle-roofing/ declared the blog category archive as its
   canonical, and Yoast then built og:url and the BreadcrumbList and ImageObject
   @ids from that wrong URL too. Every form of it is put back before the graph
   is read, so the fix is one consistent page rather than a corrected <link>
   over a graph that still points at the archive. */
const WRONG_URL = { '/services/asphalt-shingle-roofing/': `${SITE}/asphalt-shingle-roofing/` }

/* Utility pages nobody should land on from a search result. /thank-you/ is the
   form confirmation. */
const NOINDEX = new Set(['/thank-you/'])

/* The share image for pages whose own is missing or absent: the crew under the
   flag, from the homepage. 1365x2048; the platforms crop, and a real photograph
   of this company beats a logo card. */
const OG_FALLBACK = '/assets/2026/03/SEMI8066.jpg.webp'

/* The one real hub among the archive-shaped pages. */
const HUBS = new Set(['/blog/'])

/* Descriptions for pages that have none and are not covered by the content
   pass. Written from what the page itself shows. */
const DESCRIPTIONS = {}

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
    legalName: BUSINESS.legalName,
    url: `${SITE}/`,
    logo: { '@id': LOGO_ID },
    image: [{ '@id': LOGO_ID }, absolutize(BUSINESS.image)],
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

const hasType = (n, t) => n && ([].concat(n['@type'] || []).includes(t))

export async function transformDoc(doc, ctx) {
  const rep = ctx.report.meta
  const bump = (k, by = 1) => { rep[k] = (rep[k] || 0) + by }
  let html = doc.html
  const url = doc.url

  /* 0. A page whose Yoast output was built on the wrong URL. */
  if (WRONG_URL[url]) {
    const right = `${SITE}${url}`
    let n = 0, out
    ;[out, n] = replaceAll(html, WRONG_URL[url], right); html = out; bump('wrongUrlFixed', n)
    ;[out, n] = replaceAll(html, WRONG_URL[url].replace(/\//g, '\\/'), right.replace(/\//g, '\\/')); html = out; bump('wrongUrlFixed', n)
  }

  /* 1. Social images and URLs back to absolute -- and pointing at a file that
     exists. LiteSpeed converted the uploads to .webp and served those in place
     of the originals, so 102 of the 197 distinct og:image files Yoast named are
     not on disk; 100 of them have the .webp sibling. A share card with a broken
     image is worse than none. */
  for (const key of ['og:image', 'og:image:secure_url', 'twitter:image', 'og:url']) {
    let v = getMeta(html, key)
    if (!v) continue
    if (v.startsWith(SITE)) v = v.slice(SITE.length)
    if (v.startsWith('/') && !v.startsWith('//') && key !== 'og:url') {
      const onDisk = (p) => existsSync(join(ctx.OUT, p.split('?')[0].replace(/^\//, '')))
      if (!onDisk(v) && onDisk(`${v}.webp`)) { v = `${v}.webp`; bump('ogImageToWebp') }
      else if (!onDisk(v)) { (rep.ogImageMissing ||= []).push(`${url} ${v}`) }
    }
    const abs = absolutize(v)
    if (abs !== getMeta(html, key)) { html = setMeta(html, key, abs); bump('absolutizedMeta') }
  }
  /* A share image that exists, on every indexable page. Two files Yoast named
     exist nowhere (the homepage's snappit-new.jpg and one Center Valley photo),
     and 174 pages had no og:image at all. The fallback is the team photograph
     the homepage already shows -- real people, this company, on this site. */
  {
    const cur = getMeta(html, 'og:image')
    const onDisk = (p) => existsSync(join(ctx.OUT, p.replace(SITE, '').split('?')[0].replace(/^\//, '')))
    const indexable = !/noindex/i.test(getMeta(html, 'robots')) && !DUPLICATE_OF[url] && !NOINDEX.has(url)
    if ((cur && !onDisk(cur)) || (!cur && indexable && doc.kind !== 'archive' && doc.kind !== 'testimonial')) {
      const fallback = onDisk(OG_FALLBACK) ? OG_FALLBACK : null
      if (fallback) {
        html = setMeta(html, 'og:image', absolutize(fallback))
        if (getMeta(html, 'og:image:secure_url')) html = setMeta(html, 'og:image:secure_url', absolutize(fallback))
        if (getMeta(html, 'twitter:image')) html = setMeta(html, 'twitter:image', absolutize(fallback))
        for (const k of ['og:image:width', 'og:image:height', 'og:image:type']) html = html.replace(new RegExp(`<meta\\b[^>]*\\b(?:name|property)=["']${k}["'][^>]*>\\s*`, 'gi'), '')
        bump(cur ? 'ogImageReplaced' : 'ogImageAdded')
      }
    }
  }
  if (getMeta(html, 'og:image')) {
    const img = getMeta(html, 'og:image')
    if (/\.webp$/i.test(img) && getMeta(html, 'og:image:type') !== 'image/webp') html = setMeta(html, 'og:image:type', 'image/webp')
    const dims = ctx.dims[img.replace(SITE, '')]
    if (dims && !getMeta(html, 'og:image:width')) { html = setMeta(html, 'og:image:width', String(dims[0])); html = setMeta(html, 'og:image:height', String(dims[1])) }
    // Yoast emits no twitter:card here; without it the large-image card is not used.
    if (!getMeta(html, 'twitter:card')) { html = setMeta(html, 'twitter:card', 'summary_large_image'); bump('twitterCards') }
  }

  /* Head tags that only made sense on WordPress: the XFN profile link, and
     rel=prev/next on pages that are out of the index anyway. */
  html = html.replace(/<link\b[^>]*rel=["']profile["'][^>]*>\s*/gi, '')

  /* 2. The graph. */
  const y = getYoastGraph(html)
  if (y) {
    const { graph } = y
    const count = { n: 0 }
    absolutizeNode(graph, count)
    if (count.n) bump('absolutizedJsonLd', count.n)

    const article = graph.find((n) => hasType(n, 'Article'))
    const webpage = graph.find((n) => hasType(n, 'WebPage') || hasType(n, 'CollectionPage'))
    const website = graph.find((n) => hasType(n, 'WebSite'))
    doc.kind = article ? 'post' : graph.some((n) => hasType(n, 'CollectionPage')) ? 'archive'
      : url.startsWith('/testimonial/') ? 'testimonial' : 'page'
    doc.lastmod = (webpage && webpage.dateModified) || (article && article.dateModified) || null

    if (!graph.some((n) => n['@id'] === ORG_ID)) {
      graph.push(organizationNode(), logoNode())
      bump('organizationNodes')
    }

    if (website) {
      if (website.name === BUSINESS.alternateName) website.name = BUSINESS.name
      if (!website.publisher) website.publisher = { '@id': ORG_ID }
      // A sitelinks search box: retired by Google in 2024, and this host has no
      // search to point it at anyway.
      if (website.potentialAction) { delete website.potentialAction; bump('searchActionsRemoved') }
    }

    if (url === '/' && webpage && !webpage.about) webpage.about = { '@id': ORG_ID }
    // The About and Contact pages are about the business too, and schema.org has
    // a type for each.
    if (webpage && (url === '/about-us/' || url === '/contact/')) {
      if (!webpage.about) webpage.about = { '@id': ORG_ID }
      const extra = url === '/about-us/' ? 'AboutPage' : 'ContactPage'
      const t = [].concat(webpage['@type'])
      if (!t.includes(extra)) webpage['@type'] = [...t, extra]
    }

    // Posts: the company publishes them, and "Admin" is not an author anyone
    // can look up. The Person node it pointed at had an avatar URL that
    // resolves to nothing here.
    if (article) {
      article.publisher = { '@id': ORG_ID }
      const authorId = article.author && article.author['@id']
      article.author = { '@id': ORG_ID }
      if (webpage && webpage.author && webpage.author['@id'] === authorId) webpage.author = { '@id': ORG_ID }
      if (authorId) {
        const stillUsed = JSON.stringify(graph).includes(`"@id":"${authorId}"`) && graph.some((n) => n['@id'] !== authorId && JSON.stringify(n).includes(authorId))
        if (!stillUsed) {
          const i = graph.findIndex((n) => n['@id'] === authorId && hasType(n, 'Person'))
          if (i !== -1) { graph.splice(i, 1); bump('authorPersonsRemoved') }
        }
      }
      bump('articlesAttributed')
    }

    const svc = SERVICES.find((s) => s.url === url)
    if (svc && !graph.some((n) => hasType(n, 'Service'))) {
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

  /* 3. Canonicals and indexability -- one signal per page. */
  if (DUPLICATE_OF[url]) {
    const master = `${SITE}${DUPLICATE_OF[url]}`
    html = setCanonical(html, master)
    html = setMeta(html, 'og:url', master)
    html = setIndexable(html, true)
    bump('duplicatesDeclared')
  } else {
    if (!getCanonical(html) || getCanonical(html) !== `${SITE}${url}`) {
      html = setCanonical(html, `${SITE}${url}`); bump('canonicalsFixed')
    }
    const thin = (doc.kind === 'archive' && !HUBS.has(url)) || doc.kind === 'testimonial' || NOINDEX.has(url)
    if (thin && !/noindex/i.test(getMeta(html, 'robots'))) {
      html = setIndexable(html, false)
      bump(NOINDEX.has(url) ? 'utilityNoindexed' : doc.kind === 'archive' ? 'archivesNoindexed' : 'testimonialsNoindexed')
    }
  }
  if (/noindex/i.test(getMeta(html, 'robots'))) {
    html = html.replace(/<link\b[^>]*rel=["'](?:prev|next)["'][^>]*>\s*/gi, () => { bump('prevNextRemoved'); return '' })
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
