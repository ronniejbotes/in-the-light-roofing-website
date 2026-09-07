/**
 * Bake mirror/ + overrides/ into a folder any static host can serve.
 *
 * Until now the two only ever existed together at runtime: build/serve.mjs
 * injects the overrides into each HTML response as it goes out, which means the
 * whole of overrides/ was invisible to anything that was not the dev server.
 * Uploading the repo got you mirror/ with none of its fixes, and `npm run build`
 * produces dist/ -- the earlier hand-built rebuild, a different codebase
 * entirely. This closes that gap.
 *
 *   npm run publish:mirror        # -> publish/
 *   OUT=_site npm run publish:mirror
 *   PUBLISH_PUBLIC=1 npm run ...  # real robots.txt, no noindex (see below)
 *
 * What it does, in order:
 *   1. copies mirror/ verbatim
 *   2. writes the overrides as real files (_overrides.css, _process.js, ...)
 *   3. copies overrides/assets/ to _assets/
 *   4. injects the same tags serve.mjs injects, into every HTML page
 *   5. writes .htaccess: the redirects, the two fake endpoints, the 404
 *   6. writes a staging robots.txt unless PUBLISH_PUBLIC is set
 *
 * The injected markup mirrors serve.mjs's, with one difference: each URL here
 * carries ?v=<content hash>. The host serves these with a seven-day
 * Cache-Control and sits behind a CDN, so without it a deploy publishes new
 * files that nobody is served -- observed directly, an edge handing out a
 * 28-minute-old _overrides.css while the origin had the new one. The hash
 * changes only when the file does, so caching still works; it just cannot go
 * stale. serve.mjs needs none of this because it sends no-store.
 *
 * If you add an override to serve.mjs, add it to OVERRIDES here too, or it
 * ships working locally and missing in production -- exactly the failure this
 * file exists to fix.
 */
import { readFile, writeFile, mkdir, cp, rm, readdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIRROR = join(ROOT, 'mirror')
const OVR = join(ROOT, 'overrides')
// resolve(), not join(): an absolute OUT (OUT=C:/somewhere) has to win outright,
// and join() would glue it onto ROOT and produce a path that cannot be created.
const OUT = resolve(ROOT, process.env.OUT || 'publish')
const PUBLIC = process.env.PUBLISH_PUBLIC === '1'

/* Served URL -> file in overrides/. Must match OVERRIDE_FILES in serve.mjs. */
const OVERRIDES = {
  '_overrides.css': 'overrides.css',
  '_overrides.js': 'overrides.js',
  '_reviews.css': 'reviews.css',
  '_reviews.js': 'reviews.js',
  '_process.css': 'process.css',
  '_process.js': 'process.js',
  '_team.css': 'team.css',
  '_team.js': 'team.js',
  '_careers.css': 'careers.css',
  '_careers.js': 'careers.js',
}

/** Short content hash, so a changed file gets a URL no cache has seen. */
async function stamp(file) {
  const p = join(OVR, file)
  if (!existsSync(p)) return '0'
  return createHash('sha1').update(await readFile(p)).digest('hex').slice(0, 8)
}

/** The same tags serve.mjs injects, each carrying its file's content hash. */
async function buildTags() {
  const v = {}
  for (const [url, file] of Object.entries(OVERRIDES)) v[url] = await stamp(file)
  const css = (u) => `<link rel="stylesheet" href="/${u}?v=${v[u]}">`
  const js = (u) => `<script src="/${u}?v=${v[u]}" defer></script>`
  return css('_overrides.css') + css('_reviews.css') + css('_process.css') + css('_team.css')
    + css('_careers.css')
    + js('_overrides.js') + js('_reviews.js') + js('_process.js') + js('_team.js')
    + js('_careers.js')
}

/** Every file under dir, recursively. */
async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else out.push(p)
  }
  return out
}

/**
 * Turn mirror/_redirects into Apache rules.
 *
 * In a .htaccess the match is per-directory, so the pattern has no leading
 * slash. Every rule in the file is an exact path -- no wildcards -- so each
 * becomes one anchored RewriteRule. The optional trailing `/?` lets the
 * un-slashed form redirect too, which is what WordPress does today.
 */
function redirectsToApache(text) {
  const lines = []
  for (const raw of text.split('\n')) {
    const t = raw.trim()
    if (!t || t.startsWith('#')) continue
    const [from, to, code] = t.split(/\s+/)
    if (!from || !to) continue
    const pat = from.replace(/^\//, '').replace(/\/$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    lines.push(`RewriteRule ^${pat}/?$ ${to} [R=${Number(code) || 301},L]`)
  }
  // The source file lists some paths both with and without a trailing slash,
  // because serve.mjs matches them literally. The `/?$` above already covers
  // both forms, so those two collapse to the same rule -- emit it once.
  return [...new Set(lines)]
}

function htaccess(redirectLines) {
  return `# Generated by build/publish.mjs -- do not edit by hand.
#
# Apache/LiteSpeed equivalent of what build/serve.mjs does at runtime.

DirectoryIndex index.html
ErrorDocument 404 /404.html

<IfModule mod_rewrite.c>
  RewriteEngine On

  # --- Redirects the live site serves, from mirror/_redirects -----------------
${redirectLines.map((l) => '  ' + l).join('\n')}

  # --- Two endpoints the live site answers with PHP --------------------------
  # LiteSpeed's guest-mode script POSTs here on every page load and parses the
  # reply as JSON. Unanswered, the parse throws and takes out the rest of that
  # bundle -- which is what leaves the nav submenus expanded. Answered as a
  # static file: a clone has nothing to reload to, so it declines.
  # Rewritten rather than shipped as guest.vary.php on purpose; a .php file on a
  # PHP-enabled host would be executed rather than served.
  RewriteRule ^litespeed-cache/guest\\.vary\\.php$ /_static/guest.vary.json [L]

  # CallRail's beacon posts visit data to a WordPress REST route. No PHP here to
  # receive it, and an unanswered POST logs an error on every page load.
  RewriteCond %{QUERY_STRING} rest_route=/Calltrk/
  RewriteRule ^index\\.php$ /_static/empty.json [L]
</IfModule>

<IfModule mod_headers.c>
${PUBLIC ? '  # Published as production: no noindex header.' : `  # STAGING. This is a byte-faithful copy of a live client site sitting on a
  # different hostname; indexed, it competes with the real domain. Removed only
  # by publishing with PUBLISH_PUBLIC=1, which is a deliberate act.
  Header set X-Robots-Tag "noindex, nofollow"`}
</IfModule>

<IfModule mod_mime.c>
  AddType image/webp .webp
  AddType image/avif .avif
  AddType font/woff2 .woff2
  AddType video/mp4 .mp4
  AddType video/webm .webm
</IfModule>
`
}

const STAGING_ROBOTS = `# STAGING COPY -- not the live site.
#
# This host serves a byte-faithful clone of https://inthelightroofing.com/. Left
# crawlable it is a duplicate of the client's entire site on a second hostname,
# so everything is disallowed here. The mirror's real robots.txt is restored by
# publishing with PUBLISH_PUBLIC=1.
User-agent: *
Disallow: /
`

async function main() {
  if (!existsSync(MIRROR)) throw new Error('mirror/ not found -- nothing to publish')

  if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  // 1. The mirror, verbatim.
  await cp(MIRROR, OUT, { recursive: true })

  // 2. The overrides, as the URLs serve.mjs exposes them.
  let wrote = 0
  for (const [url, file] of Object.entries(OVERRIDES)) {
    const src = join(OVR, file)
    if (!existsSync(src)) { console.warn(`  ! missing override: ${file}`); continue }
    await cp(src, join(OUT, url))
    wrote++
  }

  // 3. Images the overrides bring with them.
  const assets = join(OVR, 'assets')
  let assetCount = 0
  if (existsSync(assets)) {
    await cp(assets, join(OUT, '_assets'), { recursive: true })
    assetCount = (await readdir(assets)).length
  }

  // 4. Inject into every HTML document.
  //
  // Not every .html here is a document: WordPress serves its feeds at
  // extension-less URLs, so they land in index.html files too. serve.mjs sniffs
  // the payload rather than trusting the name, and so does this -- injecting a
  // stylesheet link into an RSS feed produces a file no reader can parse.
  const TAGS = await buildTags()
  let injected = 0
  let skippedXml = 0
  for (const f of await walk(OUT)) {
    if (!f.endsWith('.html')) continue
    const body = await readFile(f, 'utf8')
    if (body.slice(0, 5) === '<?xml') { skippedXml++; continue }
    const i = body.lastIndexOf('</head>')
    await writeFile(f, i === -1 ? body + TAGS : body.slice(0, i) + TAGS + body.slice(i), 'utf8')
    injected++
  }

  // 5. Host config, and the two static answers it points at.
  const redirFile = join(MIRROR, '_redirects')
  const rules = existsSync(redirFile) ? redirectsToApache(await readFile(redirFile, 'utf8')) : []
  await writeFile(join(OUT, '.htaccess'), htaccess(rules), 'utf8')
  await mkdir(join(OUT, '_static'), { recursive: true })
  await writeFile(join(OUT, '_static', 'guest.vary.json'), '{"reload":"no"}', 'utf8')
  await writeFile(join(OUT, '_static', 'empty.json'), '{}', 'utf8')

  // The mirror has no 404 page of its own; without one Apache shows its stock
  // error page, which does not look like this site at all.
  if (!existsSync(join(OUT, '404.html'))) {
    await writeFile(join(OUT, '404.html'),
      '<!doctype html><html lang="en-US"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>Page not found | In The Light Roofing</title>'
      + '<meta name="robots" content="noindex">'
      + '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;'
      + 'font:16px/1.6 system-ui,sans-serif;background:#14161E;color:#fff;text-align:center;padding:24px}'
      + 'a{color:#00B6F1}</style></head><body><div><h1>Page not found</h1>'
      + '<p>That page is not here. <a href="/">Back to the homepage</a></p></div></body></html>',
      'utf8')
  }

  // 6. Keep a staging clone out of the index unless told otherwise.
  if (!PUBLIC) await writeFile(join(OUT, 'robots.txt'), STAGING_ROBOTS, 'utf8')

  const files = (await walk(OUT)).length
  console.log(`\npublished -> ${relative(ROOT, OUT)}/`)
  console.log(`  ${files} files`)
  console.log(`  ${injected} HTML pages injected  (${skippedXml} feeds left alone)`)
  console.log(`  ${wrote} override files, ${assetCount} assets`)
  console.log(`  ${rules.length} redirects written to .htaccess`)
  console.log(PUBLIC
    ? '  robots.txt: the mirror\'s own (PUBLISH_PUBLIC=1)'
    : '  robots.txt: STAGING, disallow all + X-Robots-Tag noindex')
  console.log(`\nUpload the contents of ${relative(ROOT, OUT)}/ to the web root.\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
