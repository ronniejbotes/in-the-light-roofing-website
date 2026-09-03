/**
 * Download every /wp-content/ asset the built site references, into static/.
 *
 * Paths are preserved exactly, so image URLs that Google has already indexed
 * (and anything hotlinking them) keep resolving after the cutover.
 *
 * Run after a build: the reference list is read out of dist/.
 */
import { readFile, readdir, writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const OUT = join(ROOT, 'static')
const ORIGIN = 'https://inthelightroofing.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function walk(dir, base = dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p, base)))
    else out.push(p)
  }
  return out
}

// Attribute references, plus url(...) inside inline style attributes -- section
// backgrounds are emitted that way and would otherwise be missed.
const REF = /(?:href|src|content)="(\/wp-content\/[^"]+)"|url\(['"]?(\/wp-content\/[^'")]+)/g

async function main() {
  if (!existsSync(DIST)) {
    console.error('dist/ not found. Run `npm run build` first.')
    process.exit(1)
  }

  const refs = new Set()
  for (const f of (await walk(DIST)).filter((f) => f.endsWith('.html'))) {
    const html = await readFile(f, 'utf8')
    for (const m of html.matchAll(REF)) refs.add((m[1] || m[2]).split("?")[0])
  }

  // Favicon variants referenced from <link rel=icon> are included by the regex
  // above; nothing else needs adding by hand.
  const list = [...refs].sort()
  console.log(`${list.length} distinct /wp-content/ assets referenced.`)

  let done = 0, skipped = 0, failed = []
  let bytes = 0

  const fetchOne = async (p) => {
    const dest = join(OUT, p.replace(/^\//, ''))
    if (existsSync(dest)) {
      const s = await stat(dest)
      if (s.size > 0) { skipped++; bytes += s.size; return }
    }
    const url = ORIGIN + p
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
        if (!res.ok) {
          if (res.status === 404) { failed.push([p, 404]); return }
          throw new Error(String(res.status))
        }
        const buf = Buffer.from(await res.arrayBuffer())
        await mkdir(dirname(dest), { recursive: true })
        await writeFile(dest, buf)
        bytes += buf.length
        done++
        return
      } catch (e) {
        if (attempt === 2) failed.push([p, String(e.message || e)])
        else await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      }
    }
  }

  // Modest concurrency: this is the client's live production host.
  const queue = [...list]
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const p = queue.shift()
      await fetchOne(p)
      const total = done + skipped + failed.length
      if (total % 50 === 0) process.stderr.write(`  ${total}/${list.length}\n`)
    }
  })
  await Promise.all(workers)

  console.log(`downloaded ${done}, already present ${skipped}, failed ${failed.length}`)
  console.log(`total size ${(bytes / 1024 / 1024).toFixed(1)} MB`)
  if (failed.length) {
    console.log('\nAssets that could not be fetched (these 404 on the live site too):')
    for (const [p, why] of failed) console.log(`  ${why}  ${p}`)
    await writeFile(join(ROOT, '.assets-missing.json'), JSON.stringify(failed, null, 1))
  }
}

main()
