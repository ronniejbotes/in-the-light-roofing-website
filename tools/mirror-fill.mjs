/**
 * Completeness pass over the mirror.
 *
 * Scans every mirrored page and stylesheet for same-origin references, works
 * out which of them are not on disk, and fetches those from the live site.
 * Catches anything the browser crawl dropped -- responses served from Chrome's
 * memory cache, bodies lost to a closing context, assets only reachable from
 * CSS that loaded late.
 *
 * Re-runnable and idempotent: it only fetches what is genuinely absent.
 *
 * Usage: node tools/mirror-fill.mjs [--dry]
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, process.env.MIRROR_DIR || 'mirror')
const ORIGIN = 'https://inthelightroofing.com'
const DRY = process.argv.includes('--dry')
const CONCURRENCY = Number(process.env.CONCURRENCY || 6)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Every file under a directory, recursively. */
async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else out.push(p)
  }
  return out
}

/** Same-origin asset references inside a document or stylesheet. */
function refsFrom(text, ownPath) {
  const found = new Set()
  const add = (u) => {
    if (!u) return
    u = u.trim()
    if (!u || u.startsWith('data:') || u.startsWith('#') || u.startsWith('//')) return
    if (u.startsWith('mailto:') || u.startsWith('tel:') || u.startsWith('javascript:')) return
    if (u.startsWith(ORIGIN)) u = u.slice(ORIGIN.length)
    if (u.startsWith('http')) return
    if (!u.startsWith('/')) {
      if (!ownPath) return
      u = join(dirname(ownPath), u).replace(/\\/g, '/')
    }
    u = u.split('#')[0]
    if (/\.php(\?|$)/.test(u)) return
    if (!extname(u.split('?')[0])) return           // pages, not assets
    found.add(u)
  }
  for (const m of text.matchAll(/(?:src|href)=(["'])(.*?)\1/g)) add(m[2])
  for (const m of text.matchAll(/srcset=(["'])(.*?)\1/g))
    for (const p of m[2].split(',')) add(p.trim().split(/\s+/)[0])
  for (const m of text.matchAll(/url\((["']?)(.*?)\1\)/g)) add(m[2])
  return found
}

const files = await walk(OUT)
const wanted = new Set()
for (const f of files) {
  const ext = extname(f)
  if (ext !== '.html' && ext !== '.css') continue
  const rel = '/' + f.slice(OUT.length + 1).replace(/\\/g, '/')
  const own = ext === '.css' ? rel : null
  for (const r of refsFrom(await readFile(f, 'utf8'), own)) wanted.add(r)
}

const missing = [...wanted].filter((u) => !existsSync(join(OUT, u.split('?')[0])))
console.log(`referenced assets: ${wanted.size}`)
console.log(`missing on disk:   ${missing.length}`)
if (DRY || !missing.length) {
  for (const m of missing.slice(0, 60)) console.log(`   ${m}`)
  process.exit(0)
}

function rewriteCss(css) {
  let out = css
  for (const host of [ORIGIN, 'http://inthelightroofing.com']) out = out.split(host).join('')
  return out
}

let ok = 0
const failed = []
let i = 0
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (i < missing.length) {
    const u = missing[i++]
    const bare = u.split('?')[0]
    try {
      const res = await fetch(ORIGIN + u, {
        headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,*/*' },
        redirect: 'follow',
      })
      if (!res.ok) { failed.push(`${res.status} ${u}`); continue }
      const buf = Buffer.from(await res.arrayBuffer())
      const file = join(OUT, bare)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, extname(bare) === '.css' ? rewriteCss(buf.toString('utf8')) : buf)
      ok++
    } catch (e) { failed.push(`${u} — ${e.message}`) }
  }
}))

console.log(`\nfetched: ${ok}`)
console.log(`failed:  ${failed.length}`)
// A failure here usually means the reference is broken on the live site too.
for (const f of failed.slice(0, 40)) console.log(`  ! ${f}`)
