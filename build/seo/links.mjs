/**
 * Internal linking: a related-pages block on the money pages.
 *
 * The site's service pages, town pages and posts reach each other almost only
 * through the site-wide navigation. A service page does not link to the towns
 * it is offered in; a town page does not link to the services; a post about a
 * storm in Macungie does not link down to the Macungie page. Crawlers and
 * readers both follow in-body links, and a page with none is a dead end.
 *
 * This adds one block per configured page, just above the footer: a heading
 * and a short list of links, each with a one-line description. The engine is
 * generic; the data is the spec. Only pages that exist on the site may appear
 * -- the build checks every target against the published tree and refuses to
 * write a link to nothing.
 *
 * Styled by overrides/links.css. Plain HTML, no schema: there is no rich
 * result for a list of links, and the value is in the links themselves.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { escapeHtml, escapeAttr, insertBeforeBodyEnd } from './lib.mjs'

/**
 * url -> { heading, intro?, links: [{ url, label, text }] }
 * `text` is the one-line description under the label. Filled by the content
 * workstream; every url must be a real page.
 */
export const RELATED = {}

function block(spec) {
  const items = spec.links.map((l) =>
    `<li class="itlr-related__item"><a class="itlr-related__link" href="${escapeAttr(l.url)}">`
    + `<span class="itlr-related__label">${escapeHtml(l.label)}</span>`
    + (l.text ? `<span class="itlr-related__text">${escapeHtml(l.text)}</span>` : '')
    + '</a></li>').join('')
  return `<section class="itlr-related" aria-labelledby="itlr-related-h">`
    + `<div class="itlr-related__inner">`
    + `<h2 class="itlr-related__heading" id="itlr-related-h">${escapeHtml(spec.heading)}</h2>`
    + (spec.intro ? `<p class="itlr-related__intro">${escapeHtml(spec.intro)}</p>` : '')
    + `<ul class="itlr-related__list">${items}</ul>`
    + '</div></section>'
}

/** Insert markup before the site footer, or before </body> if there is none. */
function insertBeforeFooter(html, markup) {
  const i = html.search(/<(footer\b|div\b[^>]*data-elementor-type="footer")/i)
  if (i === -1) return insertBeforeBodyEnd(html, markup)
  return html.slice(0, i) + markup + '\n' + html.slice(i)
}

export async function transformDoc(doc, ctx) {
  const spec = RELATED[doc.url]
  if (!spec) return
  const rep = ctx.report.links
  const ok = []
  for (const l of spec.links) {
    const rel = l.url.replace(/^\//, '').replace(/\/$/, '')
    const target = rel === '' ? join(ctx.OUT, 'index.html') : join(ctx.OUT, rel, 'index.html')
    if (existsSync(target)) ok.push(l)
    else (rep.missingTargets ||= []).push(`${doc.url} -> ${l.url}`)
  }
  if (!ok.length) return
  doc.html = insertBeforeFooter(doc.html, block({ ...spec, links: ok }))
  rep.blocks = (rep.blocks || 0) + 1
  rep.links = (rep.links || 0) + ok.length
}
