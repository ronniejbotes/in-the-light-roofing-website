/**
 * The street address in the footer of every page.
 *
 * The footer's "Contact info" column carries the phone and the email as
 * Elementor icon boxes, and no address. The address exists on one page of 426,
 * /contact/. For a local trade the physical address is the proximity signal --
 * every ranking competitor prints theirs in every footer -- and it is also what
 * ties the page to the RoofingContractor node and the Business Profile.
 *
 * This adds a third icon box after the email one, cloned from its markup so the
 * theme's footer styles apply unchanged, with a map pin drawn the way the
 * phone and envelope icons are (white fill, 22x23 box). The address text is
 * exactly the one on /contact/ and in the schema; the link is the site's own
 * Google Maps place link.
 */
import { replaceOnce } from './lib.mjs'

const ADDRESS = '871 N Fenwick St, Allentown, PA 18109'
const MAP = 'https://maps.app.goo.gl/Jp6StBjJ9B6f7mDQ9'

/* The email box the address follows. One Elementor widget id, shared by every
   page because the footer is one saved template. */
const EMAIL_BOX_ID = 'elementor-element-139c487'

const PIN = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="23" viewBox="0 0 22 23" fill="none" aria-hidden="true">'
  + '<path fill="white" d="M11 1.5C6.86 1.5 3.5 4.86 3.5 9c0 5.6 6.6 12 7.1 12.5a.6.6 0 0 0 .8 0C11.9 21 18.5 14.6 18.5 9c0-4.14-3.36-7.5-7.5-7.5Zm0 10.6a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Z"/></svg>'

function addressBox() {
  return '<div class="elementor-element elementor-element-itlr-address elementor-position-inline-start footer-info-box footer-address'
    + ' elementor-view-default elementor-mobile-position-block-start elementor-widget elementor-widget-icon-box"'
    + ' data-element_type="widget" data-widget_type="icon-box.default">'
    + '<div class="elementor-icon-box-wrapper"><div class="elementor-icon-box-icon"> <span class="elementor-icon"> ' + PIN + ' </span></div>'
    + '<div class="elementor-icon-box-content"><p class="elementor-icon-box-title"> <span > Address: </span></p>'
    + `<p class="elementor-icon-box-description"> <a href="${MAP}" target="_blank" rel="noopener">${ADDRESS}</a></p></div></div></div>`
}

export async function transformDoc(doc, ctx) {
  const rep = ctx.report.nap
  const html = doc.html
  const start = html.indexOf(`class="elementor-element ${EMAIL_BOX_ID} `)
  if (start === -1) { (rep.missing ||= []).push(doc.url); return }
  // The widget closes with the icon-box's three nested divs.
  const mail = html.indexOf('mailto:info@inthelightroofing.com', start)
  const end = html.indexOf('</div></div></div>', mail)
  if (mail === -1 || end === -1) { (rep.missing ||= []).push(doc.url); return }
  const at = end + '</div></div></div>'.length
  doc.html = html.slice(0, at) + addressBox() + html.slice(at)
  rep.added = (rep.added || 0) + 1
}
