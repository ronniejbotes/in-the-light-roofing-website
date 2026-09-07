/**
 * Shared helpers for the publish-time SEO transforms in build/seo/.
 *
 * Every module in this directory works on the same shape -- a `doc` with the
 * page's URL, its file on disk and its HTML as a string -- and edits the HTML
 * with these helpers rather than its own regexes, so that two modules touching
 * the same tag agree on what that tag looks like. The mirror's markup is
 * WordPress/Yoast output, which is regular enough for string surgery: one
 * <title>, one <link rel="canonical">, one <meta name="description">, one
 * `<script type="application/ld+json" class="yoast-schema-graph">`.
 *
 * Nothing here touches mirror/. It runs over the copy in publish/ (or dist/)
 * after declutter.mjs has renamed the WordPress paths, which is why URLs are
 * built with SITE + /assets/... rather than /wp-content/uploads/....
 */
import { readFile, readdir } from 'node:fs/promises'
import { join, relative, dirname, sep } from 'node:path'

/** The live domain. Canonicals, og:url, schema @ids and the sitemap all use it. */
export const SITE = 'https://inthelightroofing.com'

/** Every HTML document under OUT, as { url, file }. Skips XML-in-.html feeds and 404.html. */
export async function listDocs(OUT) {
  const out = []
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) { await walk(p); continue }
      if (e.name !== 'index.html') continue
      const head = (await readFile(p, { encoding: 'utf8', flag: 'r' })).slice(0, 5)
      if (head === '<?xml') continue
      out.push({ url: urlFor(OUT, p), file: p })
    }
  }
  await walk(OUT)
  // Stable order: the sitemap and the report should not reshuffle between runs.
  out.sort((a, b) => a.url.localeCompare(b.url))
  return out
}

/** /  for OUT/index.html,  /a/b/  for OUT/a/b/index.html. */
export function urlFor(OUT, file) {
  const rel = relative(OUT, dirname(file)).split(sep).join('/')
  return rel === '' || rel === '.' ? '/' : `/${rel}/`
}

/** Root-relative -> absolute on the live domain. Leaves absolute and data: URLs alone. */
export function absolutize(u) {
  if (!u) return u
  if (/^(https?:)?\/\//i.test(u) || /^(data|mailto|tel):/i.test(u)) return u
  return SITE + (u.startsWith('/') ? u : `/${u}`)
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
export function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

/* ------------------------------------------------------------- <head> tags */

export function getTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? decodeEntities(m[1].trim()) : ''
}

export function setTitle(html, title) {
  const tag = `<title>${escapeHtml(title)}</title>`
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) return html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, tag)
  return insertInHead(html, tag)
}

/** <meta name="..."> or <meta property="..."> content, decoded. */
export function getMeta(html, key) {
  const re = metaRe(key)
  const m = html.match(re)
  if (!m) return ''
  const c = m[0].match(/content=("([^"]*)"|'([^']*)')/i)
  return c ? decodeEntities(c[2] ?? c[3] ?? '') : ''
}

/** Replace the first matching meta tag, or add one to <head>. `key` may be a name or an og:/twitter: property. */
export function setMeta(html, key, content) {
  const attr = /^(og:|article:|fb:)/i.test(key) ? 'property' : 'name'
  const tag = `<meta ${attr}="${escapeAttr(key)}" content="${escapeAttr(content)}" />`
  const re = metaRe(key)
  if (re.test(html)) return html.replace(re, tag)
  return insertInHead(html, tag)
}

export function removeMeta(html, key) {
  return html.replace(new RegExp(metaRe(key).source, 'gi'), '')
}

function metaRe(key) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Attribute order varies between Yoast versions: name before content, or after.
  return new RegExp(`<meta\\b(?=[^>]*\\b(?:name|property)=["']${k}["'])[^>]*>`, 'i')
}

export function getCanonical(html) {
  const m = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)
  if (!m) return ''
  const h = m[0].match(/href=["']([^"']*)["']/i)
  return h ? h[1] : ''
}

export function setCanonical(html, absoluteUrl) {
  const tag = `<link rel="canonical" href="${escapeAttr(absoluteUrl)}" />`
  if (/<link\b[^>]*rel=["']canonical["'][^>]*>/i.test(html)) {
    return html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/i, tag)
  }
  return insertInHead(html, tag)
}

/** The robots meta, e.g. "index, follow, max-image-preview:large". '' if absent. */
export function getRobots(html) {
  return getMeta(html, 'robots')
}

/**
 * Set indexability while keeping Yoast's snippet directives. Yoast writes
 * "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
 * this swaps the first two tokens and leaves the rest.
 */
export function setIndexable(html, indexable) {
  const cur = getRobots(html)
  const rest = cur.split(',').map((s) => s.trim()).filter((s) => s && !/^(no)?index$/i.test(s) && !/^(no)?follow$/i.test(s))
  const value = [indexable ? 'index' : 'noindex', 'follow', ...rest].join(', ')
  return setMeta(html, 'robots', value)
}

/** Insert a tag just before </head>. */
export function insertInHead(html, tag) {
  const i = html.lastIndexOf('</head>')
  return i === -1 ? html + tag : `${html.slice(0, i)}${tag}\n${html.slice(i)}`
}

/** Insert markup just before </body>. */
export function insertBeforeBodyEnd(html, markup) {
  const i = html.lastIndexOf('</body>')
  return i === -1 ? html + markup : `${html.slice(0, i)}${markup}\n${html.slice(i)}`
}

/* --------------------------------------------------------------- JSON-LD */

/** Every JSON-LD block: { start, end, json (parsed or null), raw }. Offsets are into `html`. */
export function getJsonLd(html) {
  const out = []
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) {
    let json = null
    try { json = JSON.parse(m[1]) } catch { json = null }
    out.push({ start: m.index, end: m.index + m[0].length, raw: m[0], inner: m[1], json })
  }
  return out
}

/** Yoast's block is the one with class="yoast-schema-graph" and an @graph array. */
export function getYoastGraph(html) {
  for (const b of getJsonLd(html)) {
    if (b.json && Array.isArray(b.json['@graph'])) return { block: b, graph: b.json['@graph'], data: b.json }
  }
  return null
}

/**
 * Write a parsed JSON-LD object back into its block. The <script> open tag is
 * preserved as-is so Yoast's class attribute survives; only the payload moves.
 * Escaped so a stray "</script>" inside a string cannot terminate the block.
 */
export function replaceJsonLd(html, block, obj) {
  const open = block.raw.slice(0, block.raw.indexOf('>') + 1)
  const payload = JSON.stringify(obj).replace(/<\//g, '<\\/')
  return html.slice(0, block.start) + open + payload + '</script>' + html.slice(block.end)
}

/** Append a standalone JSON-LD block to <head>. */
export function addJsonLd(html, obj, cls = 'itlr-schema') {
  const payload = JSON.stringify(obj).replace(/<\//g, '<\\/')
  return insertInHead(html, `<script type="application/ld+json" class="${cls}">${payload}</script>`)
}

/* ------------------------------------------------------------------ text */

/** Replace the first occurrence; returns [html, replaced:boolean]. */
export function replaceOnce(html, find, replace) {
  const i = html.indexOf(find)
  if (i === -1) return [html, false]
  return [html.slice(0, i) + replace + html.slice(i + find.length), true]
}

/** Replace every occurrence; returns [html, count]. */
export function replaceAll(html, find, replace) {
  if (!find) return [html, 0]
  const parts = html.split(find)
  return [parts.join(replace), parts.length - 1]
}

/** The visible text of an element by regex over its opening tag; crude but adequate for one-off H1 checks. */
export function getH1s(html) {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()))
}

export function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&#0?38;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—').replace(/&#8220;|&ldquo;/g, '“').replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;|&#160;/g, ' ')
}
