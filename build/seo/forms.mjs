/**
 * Make the forms submit.
 *
 * Five Forminator forms appear 1500 times over the mirror's 426 pages, and on a
 * static host not one of them does anything. Every form carries the class
 * `forminator_ajax` and no `action`, so Forminator's own bundle posts it to
 * `/api/ajax` -- the WordPress admin-ajax endpoint, which does not exist here.
 * The submission is swallowed, the visitor sees the button spin, and the only
 * way to reach the business from the site is the phone number. That is the
 * launch blocker this module removes.
 *
 * The fix is the one the vendor's own bundle already supports. Its submit
 * handler branches on exactly this:
 *
 *     u.$el.hasClass("forminator_ajax") || n
 *       ? (... jQuery.ajax to ForminatorFront.ajaxUrl ...)
 *       : (... r.currentTarget.submit() ...)
 *
 * `n` is the save-draft flag, which is false on all five forms. So dropping the
 * class off the <form> tag turns the vendor's own code into a plain native form
 * post, with its inline validation, its loader state and its field markup all
 * still doing their jobs. Nothing here reimplements a form; it only picks the
 * branch that works without WordPress behind it. Three preconditions make that
 * safe, all verified against the mirror: every form has "has-pagination":!1, so
 * there is no multi-step state to lose; there is no forminator-g-recaptcha
 * element anywhere, so processCaptcha returns early and never blocks the post;
 * and no field is named `submit`, which would shadow HTMLFormElement.submit()
 * and make that call throw.
 *
 * What each form then needs to be a working POST target:
 *
 *   action     `/_forms/submit.php`, the handler build/publish.mjs writes into
 *              publish/_forms/. The existing method="post" and, on the careers
 *              form, enctype="multipart/form-data" are left exactly as they are.
 *   honeypot   an empty `company_website` field the handler rejects when it
 *              arrives filled in. This is the convention DEPLOY.md already
 *              names. It is hidden with the standard clip-rect rule rather than
 *              display:none: display has no bearing on whether a field is
 *              submitted (only `disabled`, a missing name, or being outside the
 *              form do), but a one-pixel clipped field is harder for a bot to
 *              spot than the obvious display:none, and unlike an off-screen
 *              left:-9999px it can never widen the page. aria-hidden and
 *              tabindex="-1" keep it away from screen readers and the tab order,
 *              and autocomplete="off" stops a browser filling it in and locking
 *              a real visitor out of the form.
 *   page       `itlr_page`, the document's own URL. The form's baked
 *              `current_url` cannot be used: it is wrong on 546 of the 1500
 *              instances, because the popup forms carry whichever page's markup
 *              Elementor saved the popup template from. The handler prefers
 *              HTTP_REFERER anyway; this is what it falls back to.
 *
 * The last job is removing the site's own submit blocker. One LiteSpeed-inlined
 * base64 script per page binds click on `.forminator-button-submit`, calls
 * preventDefault() and stopImmediatePropagation(), and only re-submits the form
 * once a `captcha_verify` POST to /api/ajax answers "success" -- which on a
 * static host it never does. It also attaches a second handler to every other
 * Forminator form on the page that returns false unless an ajax-fetched captcha
 * response has arrived. Left in place it would swallow the click before the
 * vendor's handler ever ran, so the class change above would do nothing at all.
 * It is matched by what it does rather than by a hash, so a re-captured mirror
 * cannot silently ship a variant of it.
 *
 * FIELD_LABELS below is read by build/publish.mjs when it writes the PHP
 * handler, so the notification email can call each field what the page calls it
 * ("Job Positions", "How Can We Help") and print an option's visible text
 * rather than its value -- the careers dropdown posts `Roof-Inspections` for
 * "Inside Sales Representative", which would otherwise reach the owner as a
 * misleading job title. Collected from the markup on every publish rather than
 * written down here, so it cannot drift away from the forms it describes.
 *
 * This module runs before perf.mjs on purpose. perf.mjs keeps Google's
 * reCAPTCHA script eager on any page whose inline scripts call
 * grecaptcha.ready() for a form that exists there, and the blocker removed here
 * is the only caller. Running first lets that page's reCAPTCHA be deferred with
 * every other third party.
 */
import { escapeAttr, decodeEntities } from './lib.mjs'

/** Where every form posts. build/publish.mjs writes the handler to publish/_forms/submit.php. */
export const ACTION = '/_forms/submit.php'

/** The field the handler treats as a bot trap. Empty from a person, filled by a bot. */
export const HONEYPOT_FIELD = 'company_website'

/** The hidden field carrying the real page path, since current_url cannot be trusted. */
export const PAGE_FIELD = 'itlr_page'

/**
 * form id -> field name -> { label, options }, harvested from the pages as they
 * are transformed and read by build/publish.mjs. Exported as a live object
 * rather than returned, because the SEO pass reports counts, not data, and this
 * is data. Empty when the pass is skipped with SEO=off, which the handler
 * copes with by printing raw field names and values.
 */
export const FIELD_LABELS = {}

const HONEYPOT = `<input type="text" name="${HONEYPOT_FIELD}" value="" tabindex="-1" autocomplete="off" aria-hidden="true"`
  + ' style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0">'

export async function before(ctx) {
  for (const k of Object.keys(FIELD_LABELS)) delete FIELD_LABELS[k]
  ctx.report.forms.action = ACTION
}

export async function transformDoc(doc, ctx) {
  const rep = ctx.report.forms
  const bump = (k, by = 1) => { rep[k] = (rep[k] || 0) + by }
  const pageField = `<input type="hidden" name="${PAGE_FIELD}" value="${escapeAttr(doc.url)}">`

  const html = doc.html
  let out = ''
  let at = 0
  const open = /<form\b[^>]*>/gi
  let m
  while ((m = open.exec(html))) {
    const close = html.indexOf('</form>', open.lastIndex)
    // A form with no closing tag is markup this module does not understand.
    // Copy the rest of the document through untouched and say so in the report
    // rather than guessing where the form ended.
    if (close === -1) { bump('unclosed'); break }
    const body = html.slice(open.lastIndex, close)
    collectFields(m[0], body)
    out += html.slice(at, m.index) + rewriteOpenTag(m[0], bump)
    // The hidden fields go last, next to the form_id and page_id inputs the
    // markup already ends with, rather than first: a stray <input> ahead of the
    // response-message div would be the form's first child, and the theme sizes
    // the first row off that.
    out += body + HONEYPOT + pageField + '</form>'
    bump('forms')
    bump('honeypots')
    bump('pageFields')
    at = close + '</form>'.length
    open.lastIndex = at
  }
  out += html.slice(at)

  const cleaned = guardUnhide(removeBlockers(out, bump), bump)
  if (cleaned === out) bump('pagesWithNoBlocker')
  doc.html = cleaned
}

export async function after(ctx) {
  let fields = 0
  for (const form of Object.values(FIELD_LABELS)) fields += Object.keys(form).length
  ctx.report.forms.formsMapped = Object.keys(FIELD_LABELS).length
  ctx.report.forms.fieldsMapped = fields
}

/**
 * Drop `forminator_ajax` from the class list and add the action. The class list
 * is rebuilt from its own tokens, which also collapses the double space
 * Forminator leaves behind; class matching is by token, so that changes nothing
 * about which rules apply. The action is inserted ahead of the tag's trailing
 * newline so the markup keeps the shape it had.
 */
function rewriteOpenTag(tag, bump) {
  let out = tag.replace(/(\sclass=)("([^"]*)"|'([^']*)')/i, (all, pre, quoted, dq, sq) => {
    const tokens = (dq ?? sq ?? '').split(/\s+/).filter(Boolean)
    const kept = tokens.filter((c) => c !== 'forminator_ajax')
    if (kept.length === tokens.length) return all
    bump('ajaxClassRemoved')
    return `${pre}"${kept.join(' ')}"`
  })
  if (!/\saction=/i.test(out)) {
    out = out.replace(/(\s*\/?>)$/, (end) => ` action="${ACTION}"${end}`)
    bump('actionAdded')
  }
  return out
}

/**
 * Remove the inline script that intercepts the submit click.
 *
 * Matched on what the decoded script does, not on a hash or an id: it binds
 * click on Forminator's submit button and cancels the event. Nothing else in
 * the mirror does both, and a re-captured page whose snippet has been edited
 * still matches.
 */
function removeBlockers(html, bump) {
  return html.replace(/<script\b[^>]*\bsrc="data:text\/javascript;base64,([A-Za-z0-9+/=]*)"[^>]*>\s*<\/script>/gi, (tag, b64) => {
    let js
    try { js = Buffer.from(b64, 'base64').toString('utf8') } catch { return tag }
    if (!js.includes('forminator-button-submit')) return tag
    if (!/preventDefault|stopImmediatePropagation/.test(js)) return tag
    bump('blockersRemoved')
    return ''
  })
}

/**
 * Guard the inline script that unhides the homepage estimate form.
 *
 * One LiteSpeed-inlined snippet per page does an unconditional
 * `document.querySelector('#forminator-module-8072').style.display='block'`.
 * Form 8072 exists on three pages, so on the other 423 the querySelector
 * returns null and the script throws before the line runs, putting a
 * TypeError in the console of almost every page on the site. The snippet is
 * kept rather than dropped because on the homepage it does a real job, and
 * Forminator's own show() is the only other thing that would reveal the form.
 * Inherited from the live site, which throws the same error today.
 */
function guardUnhide(html, bump) {
  return html.replace(/<script\b[^>]*\bsrc="data:text\/javascript;base64,([A-Za-z0-9+/=]*)"[^>]*>\s*<\/script>/gi, (tag, b64) => {
    let js
    try { js = Buffer.from(b64, 'base64').toString('utf8') } catch { return tag }
    if (!js.includes('forminator-module-8072')) return tag
    if (!js.includes('style.display')) return tag
    if (js.includes('if (form)') || js.includes('form &&')) return tag
    const guarded = js.replace(/(const|var|let)\s+form\s*=\s*document\.querySelector\(([^)]*)\);?\s*form\.style\.display\s*=\s*'block'/,
      "$1 form = document.querySelector($2); if (form) form.style.display = 'block'")
    if (guarded === js) return tag
    bump('unhideGuarded')
    return tag.replace(b64, Buffer.from(guarded, 'utf8').toString('base64'))
  })
}

/**
 * Record what the page calls each field, for the handler's notification email.
 *
 * The forms carry no <label> elements. The visible name of a text field is its
 * placeholder, and the visible name of a dropdown is the text of its empty
 * first option ("Job Positions"), which is also how the option values are tied
 * to the words the applicant actually read.
 */
function collectFields(openTag, body) {
  const id = (openTag.match(/\sdata-form-id="(\d+)"/i) || [])[1]
  if (!id) return
  const form = (FIELD_LABELS[id] ||= {})

  for (const m of body.matchAll(/<(input|textarea)\b[^>]*>/gi)) {
    const name = attr(m[0], 'name')
    const placeholder = attr(m[0], 'placeholder')
    if (!name || !placeholder) continue
    if (!form[name]) form[name] = { label: text(placeholder) }
  }

  for (const s of body.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const name = attr(`<select${s[1]}>`, 'name')
    if (!name) continue
    const field = (form[name] ||= { label: '' })
    field.options ||= {}
    for (const o of s[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const value = text(attr(`<option${o[1]}>`, 'value') || '')
      const label = text(o[2].replace(/<[^>]+>/g, ''))
      if (!label) continue
      // The empty option is the placeholder, so it names the field itself.
      if (value === '') { if (!field.label) field.label = label; continue }
      if (value !== label && !field.options[value]) field.options[value] = label
    }
  }
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`, 'i'))
  return m ? (m[2] ?? m[3] ?? '') : null
}

function text(s) {
  return decodeEntities(String(s)).replace(/\s+/g, ' ').trim()
}
