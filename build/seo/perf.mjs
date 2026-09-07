/**
 * Performance pass over the published HTML. Runs inside build/seo/index.mjs
 * after `alt` (which owns <img> alt/width/height/loading) and before `links`.
 *
 * Every transform here answers one finding in tools/.tmp-research/perf.json
 * (the 7 Sep 2026 audit) and is numbered after it. In order of importance:
 *
 *   A  fix 6  The 28 LiteSpeed "delayed" inline scripts are base64 data: URIs,
 *             so declutter's text rewrite never saw inside them: they still
 *             point Elementor, Forminator, CF7 and friends at
 *             https://inthelightroofing.com/wp-content/... and at the dead
 *             temp-site host. After go-live those paths do not exist. Each is
 *             decoded, run through the SAME rewrite declutter applies to every
 *             text file (rewritePaths + its rename table), and re-encoded.
 *   B  fix 1  Non-essential third parties (chat widget, reCAPTCHA, Trustindex
 *             loader, CleanTalk bot detector) become inert placeholders that
 *             overrides/perf.js wakes after load or on first interaction.
 *             ClickCease's synchronous stat.js gets `async`. GTM/gtag/CallRail
 *             are not touched.
 *   C  fix 2  The hero (first top-level section) loses its entrance animation
 *             so the largest text paints at first paint instead of at
 *             DOMContentLoaded. Animations below the hero are left alone.
 *   D  fix 3  Elementor video widgets get lazy_load:"yes" so four YouTube
 *             players (1.2 MB / 62 requests inside iframes) load when scrolled
 *             to, not on page load.
 *   E  fix 4  Right-sized derivatives (generated once by tools/make-derivatives.mjs,
 *             committed under overrides/assets/derived/) replace 1440-1600px
 *             originals rendered at 380px; the owner portrait stops being
 *             fetchpriority=high 5000px below the fold; the group photo's sizes
 *             attribute stops forcing the largest srcset candidate.
 *   G  fix 8  Each page's run of same-origin render-blocking stylesheets is
 *             concatenated into one content-addressed file per unique list,
 *             cascade order preserved exactly.
 *
 * Fix 5 (CLS) lives in overrides/perf.css; fix 7 (hero video preload) is in
 * overrides/overrides.js, which this workstream may not edit.
 *
 * Reports into ctx.report.perf. Nothing here needs node_modules.
 *
 * PERF=off skips every transform in this module (the other SEO modules still
 * run). That is the A/B baseline: index.mjs runs any module file that exists,
 * so the only other way to build "everything except perf" is to delete this
 * file, and a build another workstream starts in that window would silently
 * lose it.
 */
const OFF = process.env.PERF === 'off'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as declutter from '../declutter.mjs'
import { escapeAttr } from './lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/* ------------------------------------------------------------------------ */
/* A. declutter's rename table                                              */
/* ------------------------------------------------------------------------ */

/**
 * declutter.mjs exports rewritePaths() but keeps applyRenames() and its three
 * tables (RENAMES, WP_PREFIX, PROTECT) private. Inventing a second table here
 * would be exactly the bug this step exists to fix -- two passes disagreeing
 * about a rename -- so the tables are read out of declutter.mjs's own source
 * and applyRenames is re-implemented line for line. If declutter ever exports
 * applyRenames, that export wins and the source read is skipped.
 *
 * The regex expects the arrays as `\nconst NAME = [` ... `\n]`, which is how
 * the file is laid out today; a layout change makes before() throw rather than
 * silently publish live-host URLs.
 */
let applyRenames = declutter.applyRenames || null
/** declutter's directory moves, [from, to], DIRS then DIRS_2 -- read from its source. */
let DIR_MOVES = []
/** Root paths the browser fetches from: the DIRS targets plus the REST/ajax base. */
let FETCHABLE = /$^/

async function loadRenameTable() {
  const src = await readFile(join(HERE, '..', 'declutter.mjs'), 'utf8')
  const arr = (name) => {
    const m = src.match(new RegExp('\\nconst ' + name + ' = \\[([\\s\\S]*?)\\n\\]'))
    if (!m) throw new Error(`perf.mjs: cannot find const ${name} in build/declutter.mjs -- export it from there instead`)
    return new Function('return [' + m[1] + '\n]')()
  }
  DIR_MOVES = [...arr('DIRS'), ...arr('DIRS_2')]
  const roots = [...new Set(DIR_MOVES.map(([, to]) => to.split('/')[0]))].concat('api')
  FETCHABLE = new RegExp('^(?:' + roots.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=\\\\?/|["\'\\\\]|$)')

  if (applyRenames) return 'export'
  const RENAMES = arr('RENAMES')
  const WP_PREFIX = arr('WP_PREFIX')
  const PROTECT = arr('PROTECT')
  if (!RENAMES.length || WP_PREFIX.length !== 2 || !PROTECT.length) {
    throw new Error('perf.mjs: declutter.mjs rename tables came back empty -- refusing to guess')
  }
  // Verbatim copy of declutter.mjs applyRenames().
  applyRenames = function (text) {
    let s = text
    const parked = []
    for (const keep of PROTECT) {
      if (!s.includes(keep)) continue
      const token = ` KEEP${parked.length} `
      parked.push([token, keep])
      s = s.split(keep).join(token)
    }
    for (const [from, to] of RENAMES) s = s.split(from).join(to)
    s = s.split(WP_PREFIX[0]).join(WP_PREFIX[1])
    for (const [token, keep] of parked) s = s.split(token).join(keep)
    return s
  }
  return `source (${RENAMES.length} renames)`
}

/**
 * The exact transform declutter runs over a text file, for text it never saw,
 * plus two things it misses that only matter inside these runtime configs:
 *
 *  1. A moved directory with nothing after it -- `"uploadUrl":"...\/wp-content\/uploads"`
 *     -- has no trailing slash, so rewritePaths' `/from/` -> `/to/` swap
 *     misses it and the later `wp-` rename then turns it into `ui-content`.
 *     The same DIRS table is applied to that form here, before the renames.
 *
 *  2. rewritePaths only drops the live host in front of a moved path in its
 *     plain-slash form; the JSON-escaped `https:\/\/inthelightroofing.com\/wp-content\/`
 *     keeps its host and comes out as `https:\/\/inthelightroofing.com\/lib\/`.
 *     Measured on the step-A build (tools/perf-measure.mjs): Elementor then
 *     requests its handler bundles from the live WordPress host at a path that
 *     only exists in the static build (ERR_BLOCKED_BY_ORB), the ajax POSTs
 *     hang, and the homepage never fires `load`. Only a root-relative URL
 *     resolves correctly both on a staging hostname and on the live domain,
 *     so the host is removed -- but only in front of paths the browser fetches
 *     (the DIRS targets and /api). Navigation URLs the configs carry
 *     (`page_permalink`, Forminator `redirect_url`) keep the live domain; the
 *     canonical links in the HTML do too.
 *
 *     `/api/ajax` and `/api/` are the Forminator/CF7/Elementor ajax and REST
 *     endpoints. The static host answers them 404 where the live host
 *     answered with a CORS failure; nothing works either way, and the forms
 *     workstream owns that decision.
 */
function declutterText(text) {
  let s = declutter.rewritePaths(text)
  for (const [from, to] of DIR_MOVES) {
    const esc = from.split('/').join('(?:\\\\?/)')
    s = s.replace(new RegExp('(\\\\?/)' + esc + '(?=["\'\\\\]|$)', 'g'), (m, slash) => slash + to.split('/').join(slash))
  }
  s = applyRenames(s)
  return s.replace(/https?:(?:\\?\/){2}(?:www\.)?inthelightroofing\.com(\\?\/)([A-Za-z0-9_-]+)/g, (m, slash, first) =>
    FETCHABLE.test(first) ? slash + first : m)
}

const LIVE_WP = /inthelightroofing\.com\\?\/wp-(content|includes|admin|json)/g
const TEMP_HOST = /temp-site\.link/g
const LIVE_ANY = /https?:(?:\\?\/){2}inthelightroofing\.com/g
const count = (s, re) => (s.match(re) || []).length

/**
 * A. Decode every `src="data:text/javascript;base64,..."` script, rewrite,
 * re-encode. Re-encoded rather than inlined as plain text so the script keeps
 * its `defer` semantics and its place in the execution order -- a plain
 * inline <script> would run synchronously during parse, ahead of the deferred
 * jQuery these configs assume.
 */
function localiseInlineScripts(html, rep) {
  return html.replace(/(<script\b[^>]*\bsrc=")data:text\/javascript;base64,([A-Za-z0-9+/=]+)(")/gi, (m, pre, b64, post) => {
    rep.inlineScripts++
    const text = Buffer.from(b64, 'base64').toString('utf8')
    rep.liveRefsBefore += count(text, LIVE_WP) + count(text, TEMP_HOST)
    const out = declutterText(text)
    rep.liveRefsAfter += count(out, LIVE_WP) + count(out, TEMP_HOST)
    rep.liveNavUrlsKept += count(out, LIVE_ANY)
    if (out === text) return m
    rep.inlineScriptsRewritten++
    return pre + 'data:text/javascript;base64,' + Buffer.from(out, 'utf8').toString('base64') + post
  })
}

/**
 * A (cont.). Elementor's lightbox deep-link hashes carry the same shape:
 * `#elementor-action:action=lightbox&settings=<base64 JSON>` with the
 * upload's live-host URL inside. Same rewrite, re-encoded and URL-encoded.
 */
function localiseActionHashes(html, rep) {
  return html.replace(/data-e-action-hash="([^"]+)"/g, (m, enc) => {
    let dec
    try { dec = decodeURIComponent(enc) } catch { return m }
    const out = dec.replace(/settings=([A-Za-z0-9+/=]+)/, (mm, b64) => {
      const text = Buffer.from(b64, 'base64').toString('utf8')
      const fixed = declutterText(text)
      if (fixed === text) return mm
      rep.actionHashesRewritten++
      return 'settings=' + Buffer.from(fixed, 'utf8').toString('base64')
    })
    if (out === dec) return m
    return `data-e-action-hash="${encodeURIComponent(out).replace(/%23/g, '#')}"`
  })
}

/* ------------------------------------------------------------------------ */
/* B. third parties off the critical path                                   */
/* ------------------------------------------------------------------------ */

/**
 * Scripts that become inert placeholders -- `type="text/plain"` so the
 * browser neither fetches nor runs them, `data-itlr-defer="1"` so
 * overrides/perf.js can find them and recreate each as a real <script> with
 * the same attributes once the page has loaded and the browser is idle, or on
 * the first interaction. Every other attribute (src, defer, id, data-bot-id)
 * is kept, because the woken script is built from them.
 *
 * Measured on the audit: with these blocked the homepage's long-task total
 * fell 17.3 s -> 7.1 s on the mobile profile. None of them draws anything
 * above the fold, and none has a page dependency: the chat widget mounts
 * itself, reCAPTCHA is only rendered by Forminator when a form has a captcha
 * field (none does), CleanTalk's detector reports back to CleanTalk, and the
 * Trustindex widget is replaced by overrides/reviews.js wherever it appears.
 *
 * Not here, on purpose: Google Tag Manager, every gtag.js, CallRail swap.js.
 */
const DEFER_SRC = [
  ['fastbots', /app\.fastbots\.ai\/embed\.js/i],
  ['trustindex', /cdn\.trustindex\.io\/loader\.js/i],
  ['cleantalk', /fd\.cleantalk\.org\/ct-bot-detector/i],
  ['recaptcha', /www\.google\.com\/recaptcha\/api\.js/i],
]

/** ClickCease's stat.js is the one synchronous third-party script in <head>. It becomes async; nothing else about it changes. */
const CLICKCEASE_SYNC = /clickcease\.com\/monitor\/stat\.js/i

function attrOf(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`, 'i'))
  return m ? (m[2] ?? m[3]) : null
}

function toPlaceholder(tag) {
  const stripped = tag.replace(/\stype=("[^"]*"|'[^']*')/i, '')
  return stripped.replace(/\s*>$/, ' type="text/plain" data-itlr-defer="1">')
}

/**
 * A site-wide custom snippet (LiteSpeed-inlined, on all 426 pages) renders an
 * invisible reCAPTCHA for the homepage estimate form at DOM-ready with a bare
 * `grecaptcha.ready(...)`, and its submit handler calls grecaptcha directly.
 * That branch only runs where its form exists -- `if (jQuery("#forminator-
 * module-8072").length)` -- so on those pages reCAPTCHA has to be present
 * before DOMContentLoaded and is left exactly as it was. Everywhere else the
 * snippet's remaining uses are guarded with `typeof grecaptcha !== 'undefined'`
 * or run only after a popup opens, and the deferral is safe.
 *
 * Detected from the page, not from a list: any inline script that calls
 * grecaptcha.ready() and names a form id that exists in the document.
 */
function needsRecaptchaAtReady(html) {
  for (const m of html.matchAll(/src="data:text\/javascript;base64,([A-Za-z0-9+/=]+)"/g)) {
    const text = Buffer.from(m[1], 'base64').toString('utf8')
    if (!/grecaptcha\.ready\(/.test(text)) continue
    for (const f of text.matchAll(/#forminator-module-(\d+)/g)) {
      if (html.includes(`id="forminator-module-${f[1]}"`)) return true
    }
  }
  return false
}

function deferThirdParties(html, rep) {
  const keepRecaptcha = needsRecaptchaAtReady(html)
  if (keepRecaptcha) rep.recaptchaKeptEager++
  return html.replace(/<script\b[^>]*>/gi, (tag) => {
    if (/\sdata-itlr-defer=/.test(tag)) return tag
    const src = attrOf(tag, 'src')
    if (!src) return tag

    if (CLICKCEASE_SYNC.test(src) && !/\s(async|defer)\b/i.test(tag)) {
      rep.clickceaseAsync++
      return tag.replace(/\s*>$/, ' async>')
    }

    for (const [name, re] of DEFER_SRC) {
      if (!re.test(src)) continue
      if (name === 'recaptcha' && keepRecaptcha) return tag
      rep.deferred[name] = (rep.deferred[name] || 0) + 1
      return toPlaceholder(tag)
    }

    // LiteSpeed inlined the Trustindex fallback loader as a data: URI. It only
    // injects loader.js again, so it is deferred with it; nothing else inline
    // bootstraps any of the four.
    if (src.startsWith('data:text/javascript;base64,')) {
      const text = Buffer.from(src.slice('data:text/javascript;base64,'.length), 'base64').toString('utf8')
      for (const [name, re] of DEFER_SRC) {
        if (re.test(text)) { rep.deferred[name + 'Inline'] = (rep.deferred[name + 'Inline'] || 0) + 1; return toPlaceholder(tag) }
      }
    }
    return tag
  })
}

/* ------------------------------------------------------------------------ */
/* shared: Elementor data-settings JSON inside an HTML attribute            */
/* ------------------------------------------------------------------------ */

/** Only the entities esc_attr() produces; decodeEntities() would also turn &#8217; into a curly quote inside JSON strings. */
function decodeAttr(s) {
  return s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/**
 * Edit the data-settings JSON of one opening tag. `edit(settings)` mutates and
 * returns true when something changed. Invalid JSON is left untouched and
 * counted: Elementor logs an error for a data-settings it cannot parse, and a
 * half-edited attribute would be worse than the animation it carries.
 */
function editSettings(tag, edit, rep) {
  const m = tag.match(/\sdata-settings="([^"]*)"/)
  if (!m) return tag
  let settings
  try { settings = JSON.parse(decodeAttr(m[1])) } catch { rep.settingsUnparseable++; return tag }
  if (!settings || typeof settings !== 'object' || !edit(settings)) return tag
  return tag.replace(m[0], ` data-settings="${escapeAttr(JSON.stringify(settings))}"`)
}

/* ------------------------------------------------------------------------ */
/* C. the hero paints at first paint                                        */
/* ------------------------------------------------------------------------ */

/**
 * Elementor's entrance animations add `elementor-invisible` in the markup and
 * remove it when a waypoint handler runs after DOMContentLoaded. In the hero
 * that means the sub-heading and the buttons -- the largest text on the page
 * -- are invisible until every deferred script has run: 34 s on the audit's
 * mobile profile, and the measured LCP flipped between 9 s and 39 s
 * depending on which element the browser counted. Below the hero the effect
 * is what the design intends, so only the first top-level section of the
 * page's own Elementor document (not the header's) is touched, and only the
 * animation keys leave its data-settings; everything else in there stays.
 */
const ANIMATION_KEY = /^_?animation(_|$)/

/** [start, end) of the first top-level section inside the page's own Elementor document, or null. */
function heroExtent(html) {
  const wrap = html.match(/<div\b[^>]*\bdata-elementor-type="[^"]*"[^>]*\bdata-elementor-post-type="(?:page|post)"[^>]*>/)
  if (!wrap) return null
  let i = wrap.index + wrap[0].length
  while (i < html.length && /\s/.test(html[i])) i++
  const open = html.slice(i, i + 12).match(/^<(section|div)\b/)
  if (!open) return null
  const tag = open[1]
  const re = new RegExp(`<(/?)${tag}\\b`, 'g')
  re.lastIndex = i
  let depth = 0, m
  while ((m = re.exec(html))) {
    if (m[1] === '/') {
      depth--
      if (depth === 0) return [i, html.indexOf('>', m.index) + 1]
    } else {
      depth++
    }
  }
  return null
}

function unhideHero(html, rep) {
  const ext = heroExtent(html)
  if (!ext) return html
  let hero = html.slice(ext[0], ext[1])
  if (!/elementor-invisible/.test(hero)) return html
  hero = hero.replace(/<[a-z][^>]*\belementor-invisible\b[^>]*>/gi, (tag) => {
    rep.heroInvisibleRemoved++
    let out = tag.replace(/\sclass="([^"]*)"/, (mm, cls) => ` class="${cls.split(/\s+/).filter((c) => c && c !== 'elementor-invisible').join(' ')}"`)
    out = editSettings(out, (s) => {
      let changed = false
      for (const k of Object.keys(s)) if (ANIMATION_KEY.test(k)) { delete s[k]; changed = true; rep.heroAnimationKeysRemoved++ }
      return changed
    }, rep)
    return out
  })
  return html.slice(0, ext[0]) + hero + html.slice(ext[1])
}

/* ------------------------------------------------------------------------ */
/* D. video widgets load when scrolled to                                   */
/* ------------------------------------------------------------------------ */

/**
 * Elementor's video handler (lib/elementor/assets/js/video.*.bundle.min.js)
 * reads lazy_load from data-settings and, when set, waits for the widget to
 * scroll into view before creating the YouTube iframe -- the same path the
 * two widgets that already carry it take. Four eager players on the homepage
 * were 1.2 MB and 62 requests inside iframes at load, 14 000 px down the page.
 */
function lazyVideos(html, rep) {
  return html.replace(/<div\b[^>]*\belementor-widget-video\b[^>]*>/gi, (tag) =>
    editSettings(tag, (s) => {
      if (s.lazy_load === 'yes') return false
      s.lazy_load = 'yes'
      rep.videosLazied++
      return true
    }, rep))
}

/* ------------------------------------------------------------------------ */
/* E. right-sized images                                                    */
/* ------------------------------------------------------------------------ */

const DERIVED_DIR = join(ROOT, 'overrides', 'assets', 'derived')
const TEAM_WIDTH = 420
const GALLERY_WIDTH = 760

/**
 * The name tools/make-derivatives.mjs gives a derivative of a served path:
 * /assets/2024/03/x.jpg -> 2024-03-x-760.webp. A `.jpg.webp` served variant
 * maps to the same derivative as its .jpg source. The two functions must
 * agree; if they drift the derivative is simply not found and the original
 * stays, which the build report shows as a zero count.
 */
function derivedName(servedPath, width) {
  const p = servedPath.replace(/^\/assets\//, '').replace(/\.webp$/i, (m, off, s) => (/\.(jpe?g|png)\.webp$/i.test(s) ? '' : m))
  const b = basename(p)
  const ym = p.slice(0, p.length - b.length).replace(/\/$/, '').replace(/\//g, '-')
  return (ym ? ym + '-' : '') + b.replace(/\.[a-z0-9]+$/i, '') + `-${width}.webp`
}

const derivedCache = new Map()
/** The served URL of an existing derivative, or null. */
function derivedUrl(kind, servedPath, width) {
  const key = kind + servedPath
  if (derivedCache.has(key)) return derivedCache.get(key)
  const name = derivedName(servedPath.split('?')[0], width)
  const url = existsSync(join(DERIVED_DIR, kind, name)) ? `/_assets/derived/${kind}/${name}` : null
  derivedCache.set(key, url)
  return url
}

/** (b) /past-work/ gallery thumbnails: data-thumbnail -> derivative; the lightbox <a href> keeps the original. */
function galleryThumbs(html, rep) {
  const originals = new Set()
  html = html.replace(/\sdata-thumbnail="(\/assets\/[^"]+)"/g, (m, src) => {
    const d = derivedUrl('gallery', src, GALLERY_WIDTH)
    if (!d) return m
    originals.add(src)
    rep.galleryThumbsRewritten++
    return ` data-thumbnail="${d}"`
  })
  // Any <img> showing the same original at thumbnail size follows it.
  for (const src of originals) {
    html = html.replace(/<img\b[^>]*>/gi, (tag) => {
      if (attrOf(tag, 'src') !== src) return tag
      rep.galleryImgsRewritten++
      return tag.replace(/\ssrc=("[^"]*"|'[^']*')/, ` src="${derivedUrl('gallery', src, GALLERY_WIDTH)}"`)
    })
  }
  return html
}

function setAttr(tag, name, value) {
  const re = new RegExp(`\\s${name}=("[^"]*"|'[^']*')`, 'i')
  const piece = ` ${name}="${escapeAttr(value)}"`
  return re.test(tag) ? tag.replace(re, piece) : tag.replace(/\s*\/?>$/, (end) => `${piece}${end}`)
}
function dropAttr(tag, name) {
  return tag.replace(new RegExp(`\\s${name}=("[^"]*"|'[^']*')`, 'i'), '')
}

/**
 * (c) The owner's portrait: fetchpriority="high" with no loading attribute,
 * ~5000 px down the page, rendered 550-585 px wide from a 1318 px file while
 * an 801 px variant sits in its own srcset. The audit measured it at 102 KB
 * fetched at top priority ahead of the hero. Rendered 550x703 desktop and
 * full-width on phones (390 css px at 2x = 780), so 600px / 100vw picks the
 * 801w candidate in both cases.
 *
 * (d) The group photo SEMI8066: `sizes="auto, (max-width: 1365px) 100vw,
 * 1365px"` makes Chrome pick the 1365w file (265 KB) for a 1090 px slot;
 * measured rendered widths 1090 and 1051 at 1440, 1401 at 1920, 390 on
 * phones. Below 1500 px the 1024w candidate (125 KB) covers it -- 6 % of
 * upscaling on a cover-cropped photograph -- and above that the 1365w file
 * is the largest there is anyway.
 */
function ownerAndGroupPhotos(html, rep, dims) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = attrOf(tag, 'src') || ''
    if (/\/owner-headshot\.png\.webp$/.test(src)) {
      const variant = src.replace(/\.png\.webp$/, '-801x1024.png.webp')
      if (!dims[variant]) return tag
      let out = dropAttr(tag, 'fetchpriority')
      out = setAttr(out, 'loading', 'lazy')
      out = setAttr(out, 'src', variant)
      out = setAttr(out, 'sizes', '(max-width: 767px) 100vw, 600px')
      rep.ownerPortraitFixed++
      return out
    }
    if (/\/SEMI8066\.jpg\.webp$/.test(src) && /\ssrcset=/.test(tag)) {
      rep.groupPhotoSizesFixed++
      // Phones render it at 90 % of the viewport (351 of 390 px), so 90vw at
      // 2x asks for 702 px and gets the 768w file instead of the 1024w one.
      return setAttr(tag, 'sizes', '(max-width: 767px) 90vw, (max-width: 1024px) 100vw, (max-width: 1500px) 1024px, 1365px')
    }
    return tag
  })
}

/**
 * (a) Team portraits in CSS. The crew carousel paints the five portraits as
 * CSS backgrounds (1366x2048, 93-211 KB each) on slides that overrides/team.js
 * replaces with a photo stack rendering them at ~180 px. team.js maps the URL
 * it reads to the 420 px derivative, but by the time it runs the browser has
 * already fetched the backgrounds -- so the stylesheet is what has to change.
 * Applied to CSS text only (the per-page stylesheets and inline <style>);
 * the former employee's portraits have no derivative and stay untouched.
 */
function rewritePortraitCss(css, rep) {
  return css.replace(/\/assets\/\d{4}\/\d{2}\/SEMI\d+\.(?:jpe?g|png)(?:\.webp)?/gi, (src) => {
    const d = derivedUrl('team', src, TEAM_WIDTH)
    if (!d) return src
    rep.portraitCssRewritten++
    return d
  })
}

function rewritePortraitsInStyleBlocks(html, rep) {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) => rewritePortraitCss(block, rep))
}

/* ------------------------------------------------------------------------ */
/* G. one stylesheet per run of render-blocking stylesheets                 */
/* ------------------------------------------------------------------------ */

/**
 * 44-48 same-origin stylesheets in <head> (705 KB) on every template, each
 * a render-blocking request. They are concatenated in document order into one
 * file per distinct ordered list, so the cascade is exactly what it was.
 *
 * Three things break a run and start a new bundle: an inline <style> (a
 * stylesheet moved across it would change which rule wins), a stylesheet
 * that cannot be bundled (cross-origin, a media query, a missing file), and
 * `#elementor-frontend-css`, which Elementor's assets loader looks up by id
 * to insert its lazily-loaded lightbox/dialog CSS *before* -- bundled away,
 * the loader would append that CSS to the end of <head>, after every page
 * rule, and the lightbox would inherit a different cascade. So that one link
 * stays as it is and the bundles sit either side of it.
 *
 * Every file is checked before it goes in: no @import (its relative
 * resolution would change), no @charset (only valid at byte 0), and every
 * url() root-absolute, data:, or a fragment. The audit found all 112 files
 * clean; a page whose files are not is left with its original links.
 *
 * The override stylesheets (/_*.css) are injected after this pass runs and
 * are never part of a bundle.
 */
const cssChecked = new Map()   // file path -> css text, or null when unbundleable
const bundlesWritten = new Map() // list key -> /css/bundle-<sha1>.css

async function loadCss(OUT, href) {
  const path = join(OUT, href.split('?')[0].split('#')[0])
  if (cssChecked.has(path)) return cssChecked.get(path)
  let css = null
  if (existsSync(path)) {
    const text = await readFile(path, 'utf8')
    const relUrl = [...text.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)].some((m) => !/^(data:|https?:|\/\/|\/|#)/.test(m[2].trim()))
    if (!/@import\b|@charset\b/.test(text) && !relUrl) css = text
  }
  cssChecked.set(path, css)
  return css
}

async function bundleStylesheets(html, ctx, rep) {
  const headEnd = html.indexOf('</head>')
  if (headEnd === -1) return html
  const head = html.slice(0, headEnd)

  // Tokens that matter for cascade order, in document order.
  const tokens = []
  for (const m of head.matchAll(/<link\b[^>]*>|<style\b[^>]*>/gi)) {
    const tag = m[0]
    if (/^<style/i.test(tag)) { tokens.push({ kind: 'break' }); continue }
    if (!/\brel=["']stylesheet["']/i.test(tag)) continue
    const href = attrOf(tag, 'href') || ''
    const media = attrOf(tag, 'media')
    const id = attrOf(tag, 'id') || ''
    const ok = href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/_') && (media === null || media === 'all')
      && id !== 'elementor-frontend-css'
    tokens.push({ kind: ok ? 'css' : 'break', tag, href, start: m.index, end: m.index + tag.length })
  }
  const linksOnPage = tokens.filter((t) => t.tag).length
  rep.cssLinksBefore += linksOnPage
  let removedOnPage = 0

  // Runs of consecutive bundleable links.
  const runs = []
  let cur = []
  for (const t of tokens) {
    if (t.kind === 'css') cur.push(t)
    else { if (cur.length > 1) runs.push(cur); cur = [] }
  }
  if (cur.length > 1) runs.push(cur)

  let out = head
  for (const run of runs.reverse()) {
    const parts = []
    let usable = true
    for (const t of run) {
      const css = await loadCss(ctx.OUT, t.href)
      if (css === null) { usable = false; rep.cssRunsSkipped++; break }
      parts.push(`/* ${t.href} */\n${rewritePortraitCss(css, rep)}\n`)
    }
    if (!usable) continue
    const key = run.map((t) => t.href).join('\n')
    let url = bundlesWritten.get(key)
    if (!url) {
      const hash = createHash('sha1').update(key).digest('hex').slice(0, 12)
      url = `/css/bundle-${hash}.css`
      await mkdir(join(ctx.OUT, 'css'), { recursive: true })
      await writeFile(join(ctx.OUT, url), parts.join(''), 'utf8')
      bundlesWritten.set(key, url)
      rep.cssBundlesWritten++
    }
    const link = `<link rel="stylesheet" href="${url}" media="all" data-itlr-bundle="${run.length}">`
    // Replace from the back so earlier offsets stay valid: the first link
    // becomes the bundle, the rest disappear.
    for (let i = run.length - 1; i >= 0; i--) {
      out = out.slice(0, run[i].start) + (i === 0 ? link : '') + out.slice(run[i].end)
    }
    removedOnPage += run.length - 1
  }
  rep.cssLinksRemoved += removedOnPage
  rep.cssLinksAfter += linksOnPage - removedOnPage
  return out + html.slice(headEnd)
}

/* ------------------------------------------------------------------------ */
/* module hooks                                                             */
/* ------------------------------------------------------------------------ */

export async function before(ctx) {
  const rep = ctx.report.perf
  if (OFF) { rep.skipped = 'PERF=off'; return }
  rep.renameTable = await loadRenameTable()
  Object.assign(rep, {
    inlineScripts: 0, inlineScriptsRewritten: 0, liveRefsBefore: 0, liveRefsAfter: 0, liveNavUrlsKept: 0,
    actionHashesRewritten: 0,
    deferred: {}, clickceaseAsync: 0, recaptchaKeptEager: 0,
    heroInvisibleRemoved: 0, heroAnimationKeysRemoved: 0, settingsUnparseable: 0,
    videosLazied: 0,
    galleryThumbsRewritten: 0, galleryImgsRewritten: 0, ownerPortraitFixed: 0, groupPhotoSizesFixed: 0, portraitCssRewritten: 0,
    cssLinksBefore: 0, cssLinksRemoved: 0, cssLinksAfter: 0, cssBundlesWritten: 0, cssRunsSkipped: 0,
  })
  cssChecked.clear()
  bundlesWritten.clear()
  derivedCache.clear()
}

export async function transformDoc(doc, ctx) {
  if (OFF) return
  const rep = ctx.report.perf
  let html = doc.html

  // A. fix 6 -- first, because it is a correctness bug and not only speed.
  html = localiseInlineScripts(html, rep)
  html = localiseActionHashes(html, rep)

  // B. fix 1
  html = deferThirdParties(html, rep)

  // C. fix 2, hero only
  html = unhideHero(html, rep)

  // D. fix 3
  html = lazyVideos(html, rep)

  // E. fix 4
  html = galleryThumbs(html, rep)
  html = ownerAndGroupPhotos(html, rep, ctx.dims)
  html = rewritePortraitsInStyleBlocks(html, rep)

  // G. fix 8 -- last, so the head it reads is the final one.
  html = await bundleStylesheets(html, ctx, rep)

  doc.html = html
}
