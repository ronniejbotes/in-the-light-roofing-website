/**
 * Strip the WordPress fingerprints out of the published copy.
 *
 * The goal is a site that reads as ordinary static HTML: no /wp-content/ in the
 * markup, no theme name in the body class, no REST or xmlrpc or feed links in
 * the head, no generator meta. It runs over publish/ AFTER the mirror has been
 * copied there, so mirror/ stays a byte-faithful capture and is always the way
 * back if something here turns out to be wrong.
 *
 * WHAT IT WILL NOT TOUCH, AND WHY
 * -------------------------------
 * Class prefixes that minified JavaScript queries by name are left alone
 * (`elementor-*`, `hfe-*`). Renaming them means editing bundles that build
 * selectors at runtime, sometimes by concatenation, and a miss there is a
 * feature that silently stops working rather than a visible break. Every rename
 * below was checked for JS coupling first -- see RENAMES -- and only prefixes
 * with zero hits in any .js file are in the list.
 *
 * Those remaining classes reveal the page builder, not WordPress. Everything
 * that names WordPress or the theme is gone.
 */
import { readFile, writeFile, readdir, rename, rm, cp, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname } from 'node:path'

/* Directory moves. The paths are the single loudest tell in the markup. */
const DIRS = [
  ['wp-content/uploads', 'assets'],
  ['wp-content/plugins', 'lib'],
  ['wp-content/themes', 'theme'],
  ['wp-content/litespeed', 'css'],
  ['wp-includes', 'inc'],
]

/* Run after DIRS, so these are the already-moved paths. The theme folder is
   named after the theme, which is the whole thing we are removing. */
const DIRS_2 = [
  ['theme/hello-theme-child-master', 'theme/child'],
  ['theme/hello-elementor', 'theme/base'],
  ['lib/wordpress-seo', 'lib/seo'],
]

/* The hostnames that appear in absolute URLs. The temp-site one is a dead
   migration host baked into 426 pages -- rewriting it to root-relative fixes
   the broken preloads and link previews at the same time. */
const HOSTS = [
  'http://inthelightroofing.zb167wadjd-ez94dq1rz3mr.p.temp-site.link',
  'https://inthelightroofing.zb167wadjd-ez94dq1rz3mr.p.temp-site.link',
  'https://inthelightroofing.com',
  'http://inthelightroofing.com',
]

/**
 * Class renames, HTML and CSS together.
 *
 * Every entry was verified to have zero occurrences in any .js file in the
 * mirror before being added. `ehf-` is the Elementor Header Footer plugin's
 * prefix and appears in 128 stylesheets but no script; `hfe-` is the same
 * plugin's other prefix and IS in 13 scripts, so it is deliberately absent.
 */
const RENAMES = [
  // Longest first: these are plain substring swaps, so a shorter key must not
  // eat the front of a longer one.
  ['/wp-admin/admin-ajax.php', '/api/ajax'],  // dead endpoint either way
  ['\\/wp-admin\\/admin-ajax.php', '\\/api\\/ajax'],  // the inline-JSON form
  ['admin-ajax.php', 'ajax'],
  ['wordpress-seo', 'seo'],                // plugin folder in the sitemap XSL
  ['wp_http_referer', '_referer'],         // hidden form field, no backend here
  ['hello-theme-child-master', 'child'],   // theme folder + 128 stylesheets
  ['hello-theme', 'site'],                 // script handle ids
  ['hello-elementor', 'base'],             // theme name in paths and style ids
  ['wp-json', 'api'],                      // REST base in inline config and 13 bundles
  ['ehf-', 'sh-'],                         // site header/footer wrapper classes
  ['attachment-', 'img-size-'],
]

/**
 * Everything else beginning `wp-`.
 *
 * After the named swaps above, every remaining WordPress token is of one shape:
 * `wp-block-cover`, `wp-hooks-js`, `--wp--style--global--wide-size` and so on --
 * class names, script handles and CSS custom properties. Renaming the prefix
 * uniformly across HTML, CSS and JS keeps every definition and every use
 * together, including the ones JavaScript builds by concatenation, because the
 * literal `'wp-'` inside those bundles is rewritten too.
 *
 * Checked before doing it: no external URL on the site contains `wp-` except
 * the CallRail script below, and `wp-` cannot occur inside base64 (the standard
 * alphabet has no hyphen), so no data URI can be corrupted by this.
 */
const WP_PREFIX = ['wp-', 'ui-']

/**
 * Real URLs that contain `wp-` and must survive untouched.
 *
 * CallRail's phone-swap script is served from a versioned path that happens to
 * read `wp-0-5-3`. Renaming it would 404 the script and stop call tracking --
 * a change nobody would notice until the client asked why their call numbers
 * had gone quiet.
 */
const PROTECT = [
  'cdn.callrail.com/companies/528409341/wp-0-5-3/',
]

/* Body classes that name WordPress or the theme and are used by nothing --
   confirmed zero references in every .css and .js file in the mirror. */
const DROP_CLASSES = [
  'wp-singular',
  'wp-theme-hello-elementor',
  'wp-child-theme-hello-theme-child-master',
  'ehf-template-hello-elementor',
  'sh-template-hello-elementor',
  'ehf-stylesheet-hello-theme-child-master',
  'sh-stylesheet-hello-theme-child-master',
  'hello-elementor-default',
  'page-template-default',
  'page-template-elementor_header_footer',
]

/* Head tags that exist only because this was WordPress. */
const HEAD_STRIP = [
  /<meta[^>]+name=["']generator["'][^>]*>/gi,
  /<link[^>]+rel=["']pingback["'][^>]*>/gi,
  /<link[^>]+rel=["']EditURI["'][^>]*>/gi,
  /<link[^>]+rel=["']wlwmanifest["'][^>]*>/gi,
  /<link[^>]+rel=["']shortlink["'][^>]*>/gi,
  /<link[^>]+type=["']application\/rss\+xml["'][^>]*>/gi,
  /<link[^>]+href=["'][^"']*\/wp-json[^"']*["'][^>]*>/gi,
  /<link[^>]+rel=["']https:\/\/api\.w\.org\/["'][^>]*>/gi,
  /<link[^>]+type=["']application\/json\+oembed["'][^>]*>/gi,
  /<link[^>]+type=["']text\/xml\+oembed["'][^>]*>/gi,
  /<meta[^>]+name=["']msapplication-TileImage["'][^>]*>/gi,
]

const TEXT_EXT = new Set(['.html', '.css', '.xml', '.txt', '.js', '.json'])

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else out.push(p)
  }
  return out
}

/**
 * Move a directory, creating nothing if the source is absent.
 *
 * The rename is retried, and falls back to copy-then-delete. This repository
 * lives in an iCloud Drive folder on Windows, where the sync client and the
 * indexer both take transient handles on a directory the moment it is written;
 * renaming `uploads` -- 24,000 files that have just been copied in -- hits
 * EPERM often enough that a single attempt made the build a coin toss. Nothing
 * about the retry is Windows-specific, so it costs nothing on the Linux host
 * that runs the deploy, where the first attempt always succeeds.
 */
async function moveDir(OUT, from, to) {
  const src = join(OUT, from)
  const dst = join(OUT, to)
  if (!existsSync(src)) return false
  if (existsSync(dst)) await rm(dst, { recursive: true, force: true })

  for (let attempt = 1; ; attempt++) {
    try {
      await rename(src, dst)
      return true
    } catch (err) {
      if (err.code !== 'EPERM' && err.code !== 'EBUSY' && err.code !== 'EACCES') throw err
      if (attempt >= 4) {
        // Whoever holds the handle is not letting go. Copying leaves the
        // source untouched while it runs, so it succeeds where a rename of
        // the directory itself cannot.
        await cp(src, dst, { recursive: true })
        await rm(src, { recursive: true, force: true }).catch(() => {})
        return true
      }
      await new Promise((r) => setTimeout(r, attempt * 400))
    }
  }
}

/** Rewrite every reference to the moved paths, in whatever form it appears. */
export function rewritePaths(text) {
  let s = text
  for (const [from, to] of DIRS) {
    // Absolute, with any of the known hosts in front.
    for (const h of HOSTS) {
      s = s.split(`${h}/${from}/`).join(`/${to}/`)
    }
    // Root-relative, and the protocol-relative and escaped-slash forms that
    // turn up inside inline JSON and srcset attributes.
    s = s.split(`/${from}/`).join(`/${to}/`)
    s = s.split(`\\/${from.split('/').join('\\/')}\\/`).join(`\\/${to}\\/`)
  }
  // Anything still pointing at the dead migration host loses the host and
  // becomes root-relative; it resolves nowhere as it stands. Both the plain and
  // the backslash-escaped form, because inline JSON carries the escaped one and
  // 31 pages still had it after the first pass.
  for (const h of HOSTS.slice(0, 2)) {
    s = s.split(h).join('')
    // '\\/' is a literal backslash then a slash -- the form inline JSON uses.
    // Written as '\/' this collapses to '/' and the line quietly does nothing.
    s = s.split(h.replace(/\//g, '\\/')).join('')
  }
  return s
}

function applyRenames(text) {
  let s = text

  // Park the URLs that must not be touched behind a sentinel that contains no
  // renameable substring, then put them back once the sweep has run.
  const parked = []
  for (const keep of PROTECT) {
    if (!s.includes(keep)) continue
    const token = ` KEEP${parked.length} `
    parked.push([token, keep])
    s = s.split(keep).join(token)
  }

  for (const [from, to] of RENAMES) s = s.split(from).join(to)
  s = s.split(WP_PREFIX[0]).join(WP_PREFIX[1])

  for (const [token, keep] of parked) s = s.split(token).join(keep)
  return s
}

/** Strip WordPress-only tags, comments and body classes from a document. */
function cleanHtml(html) {
  let s = html
  for (const re of HEAD_STRIP) s = s.replace(re, '')

  // WordPress's prefetch config. It is a block of WordPress-shaped JSON listing
  // /wp-admin/ and /wp-content/ exclusions, nothing reads it here, and dropping
  // it only turns off speculative prefetching.
  s = s.replace(/<script[^>]+type=["']speculationrules["'][\s\S]*?<\/script>/gi, '')

  // Comments naming the plugin that wrote them.
  s = s.replace(/<!--\s*(\/?)\s*(Yoast|This site is optimized|WordPress|Powered by|Google Tag Manager \(noscript\))[\s\S]*?-->/gi, '')

  // Body classes. Only the ones proven unused, and only inside the body tag.
  s = s.replace(/<body([^>]*?)class="([^"]*)"/i, (m, pre, cls) => {
    const kept = cls.split(/\s+/).filter((c) => c && !DROP_CLASSES.includes(c))
    return `<body${pre}class="${kept.join(' ')}"`
  })
  return s
}

export async function declutter(OUT) {
  const report = { movedDirs: [], rewritten: 0, htmlCleaned: 0, bytesBefore: 0, bytesAfter: 0 }

  // 1. Move the directories first, so the rewrite below describes reality.
  for (const [from, to] of DIRS) {
    if (await moveDir(OUT, from, to)) report.movedDirs.push(`${from} -> ${to}`)
  }
  for (const [from, to] of DIRS_2) {
    if (await moveDir(OUT, from, to)) report.movedDirs.push(`${from} -> ${to}`)
  }
  // The comments RSS feed. Its <link> in the head is already stripped, so
  // nothing points at it, and it is the last file carrying a generator tag.
  for (const dead of ['comments/feed', 'feed']) {
    const d = join(OUT, dead)
    if (existsSync(d)) { await rm(d, { recursive: true, force: true }); report.movedDirs.push(`removed ${dead}`) }
  }

  // wp-content is now empty apart from anything unexpected; drop it if so.
  const wpc = join(OUT, 'wp-content')
  if (existsSync(wpc)) {
    const left = await readdir(wpc)
    if (!left.length) await rm(wpc, { recursive: true, force: true })
    else report.wpContentLeftovers = left
  }

  // 2. Rewrite every text file.
  for (const f of await walk(OUT)) {
    const ext = extname(f).toLowerCase()
    if (!TEXT_EXT.has(ext) && !f.endsWith('_redirects') && !f.endsWith('.htaccess')) continue

    const before = await readFile(f, 'utf8')
    let after = rewritePaths(before)

    // cleanHtml runs BEFORE applyRenames, not after. The drop-list matches
    // class names as the mirror writes them, and renaming first turned
    // `wp-theme-hello-elementor` into `wp-theme-base`, which then matched
    // nothing and survived on all 426 pages.
    if (ext === '.html' && before.slice(0, 5) !== '<?xml') {
      const cleaned = cleanHtml(after)
      if (cleaned !== after) report.htmlCleaned++
      after = cleaned
    }
    after = applyRenames(after)

    if (after !== before) {
      report.bytesBefore += before.length
      report.bytesAfter += after.length
      await writeFile(f, after, 'utf8')
      report.rewritten++
    }
  }

  return report
}
