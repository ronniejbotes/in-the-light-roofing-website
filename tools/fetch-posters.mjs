/**
 * Download YouTube poster frames for every click-to-load video facade.
 *
 * The facades could point straight at i.ytimg.com, but that is a third-party
 * request on the critical path for something the page needs in order to paint.
 * Self-hosting them removes the dependency and lets our own cache headers apply.
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import sharp from 'sharp'
import { existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'static/assets/video')

async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else if (p.endsWith('.html')) out.push(p)
  }
  return out
}

const ids = new Set()
for (const f of await walk(join(ROOT, 'dist'))) {
  const html = await readFile(f, 'utf8')
  for (const m of html.matchAll(/data-yt="([A-Za-z0-9_-]{11})"/g)) ids.add(m[1])
}

await mkdir(OUT, { recursive: true })
console.log(`${ids.size} distinct videos`)

for (const id of ids) {
  const dest = join(OUT, `${id}.jpg`)
  if (existsSync(dest)) { console.log(`  cached ${id}`); continue }
  // maxresdefault is not published for every video; fall back to hqdefault.
  let ok = false
  for (const name of ['maxresdefault', 'hqdefault']) {
    const res = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`)
    if (!res.ok) continue
    const buf = Buffer.from(await res.arrayBuffer())
    // YouTube serves a 120x90 grey placeholder when a size is missing.
    if (buf.length < 3000) continue

    // The facades render around 440px wide in a three-up grid, so a 1280px
    // JPEG is roughly ten times more than is needed. Store a sized AVIF/WebP
    // pair plus a JPEG fallback.
    const base = sharp(buf).resize({ width: 880, withoutEnlargement: true })
    const [avif, webp, jpg] = await Promise.all([
      base.clone().avif({ quality: 50, effort: 4 }).toBuffer(),
      base.clone().webp({ quality: 76 }).toBuffer(),
      base.clone().jpeg({ quality: 78, mozjpeg: true }).toBuffer(),
    ])
    await writeFile(join(OUT, `${id}.avif`), avif)
    await writeFile(join(OUT, `${id}.webp`), webp)
    await writeFile(dest, jpg)
    console.log(
      `  ${id} <- ${name}  ${(buf.length / 1024).toFixed(0)}KB -> ` +
      `avif ${(avif.length / 1024).toFixed(0)}KB / webp ${(webp.length / 1024).toFixed(0)}KB / jpg ${(jpg.length / 1024).toFixed(0)}KB`
    )
    ok = true
    break
  }
  if (!ok) console.log(`  FAILED ${id}`)
}
