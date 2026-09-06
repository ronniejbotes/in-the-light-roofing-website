/**
 * Check routes.txt against the mirror on disk, and optionally against the live site.
 *
 * routes.txt is the manifest of every URL the mirror must contain. Nothing used to
 * compare it against reality, which is how the 127 /tag/ archives stayed out of the
 * mirror: they are real pages returning 200, and the capture list simply never
 * mentioned them. Every check the repo had passed, because every check took the
 * capture list as its definition of "the whole site".
 *
 * Two directions, because they catch opposite mistakes:
 *
 *   manifest -> disk   a listed URL with no file is a page the capture missed
 *   disk -> manifest   a mirrored page not in the manifest will go stale, because
 *                      the next full capture will not re-fetch it
 *
 * Usage:
 *   node tools/mirror-audit-routes.mjs           # against the mirror on disk (fast)
 *   node tools/mirror-audit-routes.mjs --live    # also HEAD every URL on the live site
 *
 * Exits non-zero on any discrepancy.
 */
import { readFile, readdir } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { join, resolve, dirname, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIRROR = join(ROOT, process.env.MIRROR_DIR || 'mirror')
const ORIGIN = 'https://inthelightroofing.com'
const LIVE = process.argv.includes('--live')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Not pages: fetched directly because nothing links to them, so they are not
// expected to appear in the route manifest.
const ORPHANS = new Set(['/comments/feed/', '/feed/'])

const manifest = (await readFile(join(ROOT, 'routes.txt'), 'utf8'))
  .split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))

/** Every directory under mirror/ holding an index.html, as a route. */
async function pagesOnDisk(dir = MIRROR, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === 'wp-content' || e.name === 'wp-includes') continue
      await pagesOnDisk(join(dir, e.name), acc)
    } else if (e.name === 'index.html') {
      const rel = dir.slice(MIRROR.length).split(sep).join('/')
      acc.push(rel === '' ? '/' : `${rel}/`)
    }
  }
  return acc
}

function fileFor(route) {
  const p = decodeURIComponent(route.split('?')[0])
  if (p.endsWith('/') || p === '') return join(MIRROR, p, 'index.html')
  return extname(p) ? join(MIRROR, p) : join(MIRROR, p, 'index.html')
}

const redirects = existsSync(join(MIRROR, '_redirects'))
  ? new Set((await readFile(join(MIRROR, '_redirects'), 'utf8')).split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => l.trim().split(/\s+/)[0]))
  : new Set()

const onDisk = new Set(await pagesOnDisk())
const listed = new Set(manifest)

const missing = manifest.filter((r) => {
  const f = fileFor(r)
  const ok = existsSync(f) || (existsSync(join(MIRROR, r)) && statSync(join(MIRROR, r)).isFile())
  return !ok && !redirects.has(r)
})
const unlisted = [...onDisk].filter((r) => !listed.has(r) && !ORPHANS.has(r))

console.log(`manifest routes        : ${manifest.length}`)
console.log(`pages on disk          : ${onDisk.size}`)
console.log(`listed but not mirrored: ${missing.length}`)
for (const r of missing.slice(0, 30)) console.log(`   ${r}`)
if (missing.length > 30) console.log(`   … and ${missing.length - 30} more`)
console.log(`mirrored but not listed: ${unlisted.length}`)
for (const r of unlisted.slice(0, 30)) console.log(`   ${r}`)
if (unlisted.length > 30) console.log(`   … and ${unlisted.length - 30} more`)

let liveBad = []
if (LIVE) {
  console.log(`\nHEADing ${manifest.length} URLs against ${ORIGIN} …`)
  let n = 0
  for (const r of manifest) {
    let code = 0
    for (let a = 0; a < 2 && code === 0; a++) {
      try {
        const res = await fetch(ORIGIN + r, { method: 'HEAD', headers: { 'User-Agent': UA }, redirect: 'manual' })
        code = res.status
      } catch { code = 0 }
    }
    if (code !== 200) liveBad.push(`${code || 'ERR'} ${r}`)
    if (++n % 50 === 0) process.stderr.write(`  ${n}/${manifest.length}\n`)
    await new Promise((s) => setTimeout(s, 80))   // this WordPress falls over under load
  }
  console.log(`not 200 on live        : ${liveBad.length}`)
  for (const b of liveBad.slice(0, 30)) console.log(`   ${b}`)
}

const failed = missing.length + unlisted.length + liveBad.length
if (failed) {
  console.log(`\n${failed} discrepancy(ies) — the manifest and the mirror disagree.`)
  process.exit(1)
}
console.log('\nmanifest and mirror agree.')
