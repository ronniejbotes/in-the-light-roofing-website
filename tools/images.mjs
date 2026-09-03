/**
 * Responsive image derivatives.
 *
 * The original file stays exactly where it is, at exactly its original URL, so
 * every image URL Google has indexed (and anything hotlinking one) keeps
 * resolving. Alongside it we write AVIF and WebP copies at a few widths under
 * /assets/img/, and the templates emit a <picture> that offers those first and
 * falls back to the original in <img src>.
 *
 * Output manifest: content/images.json  { "<original path>": { w, h, avif[], webp[] } }
 */
import sharp from 'sharp'
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STATIC = join(ROOT, 'static')
const OUTDIR = join(STATIC, 'assets/img')
const MANIFEST = join(ROOT, 'content', 'images.json')

// Widths that cover the real slots: card thumb, half-column, full container,
// and full-bleed section background on a large display.
const WIDTHS = [480, 768, 1200, 1800]
const RASTER = /\.(jpe?g|png|webp)$/i

sharp.cache(false)
sharp.concurrency(Math.max(1, (await import('node:os')).cpus().length - 1))

async function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else out.push(p)
  }
  return out
}

const rel = (abs) => '/' + abs.slice(STATIC.length + 1).split('\\').join('/')
const key = (p) => createHash('sha1').update(p).digest('hex').slice(0, 10)

const manifest = existsSync(MANIFEST)
  ? JSON.parse(await readFile(MANIFEST, 'utf8'))
  : {}

const files = (await walk(join(STATIC, 'wp-content'))).filter((f) => RASTER.test(f))
console.log(`${files.length} raster originals`)

await mkdir(OUTDIR, { recursive: true })

let processed = 0, skipped = 0, failed = 0
let before = 0, after = 0

for (const file of files) {
  const src = rel(file)
  const orig = await stat(file)
  before += orig.size

  if (manifest[src]?.size === orig.size) { skipped++; after += manifest[src].bytes || 0; continue }

  let meta
  try {
    meta = await sharp(file).metadata()
  } catch (e) {
    console.log(`  skip (unreadable) ${src}: ${e.message.slice(0, 50)}`)
    failed++
    continue
  }
  if (!meta.width || !meta.height) { failed++; continue }

  const k = key(src)
  const entry = { w: meta.width, h: meta.height, size: orig.size, avif: [], webp: [], bytes: 0 }
  // Never upscale, and always include the native width if it is below the largest step.
  const widths = [...new Set(WIDTHS.filter((w) => w < meta.width).concat(Math.min(meta.width, 1800)))]
    .sort((a, b) => a - b)

  for (const w of widths) {
    const pipe = () => sharp(file).rotate().resize({ width: w, withoutEnlargement: true })
    for (const [fmt, opts, list] of [
      ['avif', { quality: 50, effort: 4 }, entry.avif],
      ['webp', { quality: 78, effort: 4 }, entry.webp],
    ]) {
      const name = `${k}-${w}.${fmt}`
      const dest = join(OUTDIR, name)
      try {
        const info = existsSync(dest)
          ? { size: (await stat(dest)).size }
          : await pipe()[fmt](opts).toFile(dest)
        list.push({ w, url: `/assets/img/${name}`, bytes: info.size })
        entry.bytes += info.size
      } catch (e) {
        // A format failure on one file should not stop the run.
        console.log(`  ${fmt} failed for ${src}: ${e.message.slice(0, 60)}`)
      }
    }
  }

  manifest[src] = entry
  after += entry.bytes
  processed++
  if (processed % 25 === 0) process.stderr.write(`  ${processed}/${files.length}\n`)
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 1), 'utf8')

const mb = (n) => (n / 1048576).toFixed(1)
console.log(`\nprocessed ${processed}, cached ${skipped}, unreadable ${failed}`)
console.log(`originals   ${mb(before)} MB  (kept in place -- URLs unchanged)`)
console.log(`derivatives ${mb(after)} MB  across ${Object.values(manifest).reduce((a, e) => a + e.avif.length + e.webp.length, 0)} files`)
console.log(`Wrote ${MANIFEST}`)
