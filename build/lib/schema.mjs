/**
 * JSON-LD graph.
 *
 * The live site emits WebPage / Article / CollectionPage / BreadcrumbList /
 * WebSite / ImageObject / Person and nothing else -- there is no Organization
 * or LocalBusiness node anywhere on it, so no page carries the phone number or
 * address in structured data. That gap is filled here with a RoofingContractor
 * node built ONLY from facts present in the captured source.
 *
 * Deliberately NOT included: aggregateRating and review. Self-serving review
 * markup on an organisation's own entity makes the domain ineligible for review
 * rich results. The testimonials stay as plain HTML, exactly as they are today.
 */
import { ORIGIN, abs } from './site.mjs'
import { plain, clip } from './html.mjs'

const ID = {
  org: `${ORIGIN}/#organization`,
  website: `${ORIGIN}/#website`,
}

export function organisation(site) {
  const b = site.business
  const sameAs = [...new Set([...(site.footer.socials || []), ...(site.header.socials || [])])]

  return {
    '@type': ['RoofingContractor', 'LocalBusiness'],
    '@id': ID.org,
    name: b.name,
    url: ORIGIN + '/',
    telephone: b.phone_display,
    email: b.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: b.street,
      addressLocality: b.city,
      addressRegion: b.region,
      postalCode: b.postal_code,
      addressCountry: b.country,
    },
    foundingDate: b.founded,
    founder: { '@type': 'Person', name: b.founder },
    availableLanguage: b.languages,
    areaServed: (site.areas || []).map((a) => ({
      '@type': 'City',
      name: a.name,
      address: { '@type': 'PostalAddress', addressRegion: 'PA', addressCountry: 'US' },
    })),
    makesOffer: (site.services || []).map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: s.name, url: abs(s.route) },
    })),
    ...(sameAs.length ? { sameAs } : {}),
    ...(site.logos?.header?.src ? { logo: { '@type': 'ImageObject', url: abs(site.logos.header.src) } } : {}),
  }
}

export function website(site) {
  // Reproduces the live WebSite node, with a publisher added now that an
  // organisation entity exists for it to point at.
  return {
    '@type': 'WebSite',
    '@id': ID.website,
    url: ORIGIN + '/',
    name: 'In the Light Roofing',
    description: 'Quality done right',
    publisher: { '@id': ID.org },
    inLanguage: 'en-US',
  }
}

export function breadcrumbs(trail) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${ORIGIN}/#breadcrumb`,
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      ...(t.href && i < trail.length - 1 ? { item: abs(t.href) } : {}),
    })),
  }
}

/** Build the full graph for a page. */
export function graph(ctx) {
  const { site, route, seo = {}, trail = [], kind, record } = ctx
  const url = abs(route)
  const nodes = []

  const pageType =
    kind === 'post' ? 'WebPage'
      : kind === 'archive' ? 'CollectionPage'
      : 'WebPage'

  if (kind === 'post' && record) {
    nodes.push({
      '@type': 'Article',
      '@id': `${url}#article`,
      isPartOf: { '@id': url },
      headline: record.title,
      description: seo.description || record.excerpt || undefined,
      datePublished: record.date,
      dateModified: record.modified || record.date,
      mainEntityOfPage: { '@id': url },
      publisher: { '@id': ID.org },
      author: { '@id': ID.org },
      inLanguage: 'en-US',
      ...(record.featured_image?.src ? { image: abs(record.featured_image.src) } : {}),
      ...(record.categories?.length ? { articleSection: record.categories.map((c) => c.name) } : {}),
      ...(record.tags?.length ? { keywords: record.tags.map((t) => t.name).join(', ') } : {}),
    })
  }

  nodes.push({
    '@type': pageType,
    '@id': url,
    url,
    name: seo.title,
    isPartOf: { '@id': ID.website },
    about: { '@id': ID.org },
    ...(seo.description ? { description: seo.description } : {}),
    ...(trail.length ? { breadcrumb: { '@id': `${ORIGIN}/#breadcrumb` } } : {}),
    inLanguage: 'en-US',
  })

  if (trail.length) nodes.push(breadcrumbs(trail))
  nodes.push(website(site))
  nodes.push(organisation(site))

  // FAQ markup where the page genuinely has a question/answer list.
  if (ctx.faq?.length) {
    nodes.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: ctx.faq.map((f) => ({
        '@type': 'Question',
        name: plain(f.q),
        acceptedAnswer: { '@type': 'Answer', text: plain(f.a) },
      })),
    })
  }

  if (ctx.service) {
    nodes.push({
      '@type': 'Service',
      '@id': `${url}#service`,
      name: ctx.service.name,
      serviceType: ctx.service.name,
      provider: { '@id': ID.org },
      areaServed: (site.areas || []).map((a) => ({ '@type': 'City', name: a.name })),
      ...(seo.description ? { description: seo.description } : {}),
    })
  }

  if (ctx.jobPosting) nodes.push(ctx.jobPosting)

  return { '@context': 'https://schema.org', '@graph': nodes }
}
