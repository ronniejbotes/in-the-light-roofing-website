/**
 * Generate the right-sized image derivatives the perf pass serves instead of
 * the originals. Run once, commit the output; the deploy build never needs
 * sharp or any other node_module.
 *
 *   node tools/make-derivatives.mjs            # writes overrides/assets/derived/**
 *   node tools/make-derivatives.mjs --check    # report only, write nothing
 *
 * What it makes (perf audit fix 4, tools/.tmp-research/perf.json):
 *
 *   derived/team/SEMI<n>-420.webp     The five crew portraits. Originals are
 *                                     1366x2048 (93-211 KB each); the team
 *                                     stack renders them at ~170-200 px wide,
 *                                     so 420 px covers a 2x screen.
 *                                     overrides/team.js maps a portrait URL to
 *                                     this file and falls back to the original
 *                                     if it is missing; build/seo/perf.mjs
 *                                     rewrites the carousel's CSS backgrounds
 *                                     the same way so the originals are never
 *                                     fetched.
 *   derived/gallery/<name>-760.webp   The /past-work/ gallery thumbnails.
 *                                     Originals up to 1600x1200 (up to 611 KB)
 *                                     rendered at 380x253 (desktop) or 351x234
 *                                     at 2x (mobile); 760 px covers both.
 *                                     perf.mjs rewrites data-thumbnail to these;
 *                                     the lightbox link keeps the original.
 *                                     Never enlarged: two of the fourteen are
 *                                     700 px wide and stay so.
 *
 * Sources are read from mirror/wp-content/uploads (read-only; mirror/ is never
 * written to). The gallery list is read out of mirror/past-work/index.html
 * rather than hard-coded, so a photograph swapped in Elementor flows through.
 *
 * Quality 78 WebP, the setting the audit tested: 5 portraits 841 KB -> ~83 KB,
 * 14 gallery images 2.5 MB -> ~0.9 MB, with no visible change at the rendered
 * size (see shots/perf/ for the crops that were checked).
 *
 * The former employee's portraits (SEMI7879, SEMI7885) are never generated,
 * so no derivative of them can exist for team.js to pick up.
 */
import sharp from 'sharp'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, dirname, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UPLOADS = join(ROOT, 'mirror', 'wp-content', 'uploads')
const OUT = join(ROOT, 'overrides', 'assets', 'derived')
const CHECK = process.argv.includes('--check')

const QUALITY = 78
const TEAM = ['SEMI7900', 'SEMI7949', 'SEMI7953', 'SEMI8001', 'SEMI8023']
const TEAM_WIDTH = 420
const GALLERY_WIDTH = 760
const NEVER = /SEMI7879|SEMI7885/i

/** The gallery's data-thumbnail URLs, as the mirror serves them. */
async function galleryOriginals() {
  const html = await readFile(join(ROOT, 'mirror', 'past-work', 'index.html'), 'utf8')
  const out = []
  for (const m of html.matchAll(/data-thumbnail="([^"]+)"/g)) {
    let u = m[1].replace(/^https?:\/\/[^/]+/, '')
    if (!u.startsWith('/wp-content/uploads/')) continue
    out.push(u)
  }
  return [...new Set(out)]
}

/**
 * /wp-content/uploads/2024/03/x.jpg -> 2024-03-x-760.webp
 *
 * The year/month is part of the name because the gallery really does carry
 * the same filename under two upload months (311813410_..._n.jpg in 2023/12
 * and 2024/03); by basename alone the second would overwrite the first.
 * build/seo/perf.mjs derives the same name from the served /assets/ path.
 */
export function derivedName(uploadPath, width) {
  const p = uploadPath.replace(/^\/(wp-content\/uploads|assets)\//, '')
  const b = basename(p)
  const ym = p.slice(0, p.length - b.length).replace(/\/$/, '').replace(/\//g, '-')
  return (ym ? ym + '-' : '') + b.slice(0, b.length - extname(b).length) + `-${width}.webp`
}

/** A derivative has to earn its place: below this saving the original is kept. */
const MIN_SAVING = 0.15

async function make(srcRel, destDir, width) {
  const src = join(UPLOADS, srcRel.replace(/^\/wp-content\/uploads\//, ''))
  if (!existsSync(src)) return { srcRel, error: 'missing source' }
  const dest = join(destDir, derivedName(srcRel, width))
  const before = (await stat(src)).size
  const img = sharp(src, { failOn: 'none' }).rotate()
  const meta = await img.metadata()
  const buf = await img.resize({ width, withoutEnlargement: true }).webp({ quality: QUALITY }).toBuffer()
  const outMeta = await sharp(buf).metadata()
  const row = { srcRel, dest: dest.replace(ROOT, '').replace(/\\/g, '/'), before, after: buf.length, from: `${meta.width}x${meta.height}`, to: `${outMeta.width}x${outMeta.height}` }
  if (buf.length > before * (1 - MIN_SAVING)) return { ...row, skipped: true }
  if (!CHECK) {
    await mkdir(destDir, { recursive: true })
    await writeFile(dest, buf)
  }
  return row
}

async function main() {
  const rows = []

  for (const name of TEAM) {
    if (NEVER.test(name)) continue
    // The portraits exist as .jpg with a .jpg.webp sibling; the jpg is the source of truth.
    rows.push(await make(`/wp-content/uploads/2026/03/${name}.jpg`, join(OUT, 'team'), TEAM_WIDTH))
  }
  for (const u of await galleryOriginals()) {
    if (NEVER.test(u)) continue
    rows.push(await make(u, join(OUT, 'gallery'), GALLERY_WIDTH))
  }

  let tb = 0, ta = 0
  console.log(`${CHECK ? 'CHECK ONLY -- ' : ''}webp q${QUALITY}, team ${TEAM_WIDTH}w, gallery ${GALLERY_WIDTH}w\n`)
  for (const r of rows) {
    if (r.error) { console.log(`  ! ${r.srcRel}: ${r.error}`); continue }
    if (r.skipped) { console.log(`  - ${r.srcRel.padEnd(78)} ${r.from.padEnd(10)} ${(r.before / 1024).toFixed(0).padStart(5)} KB -> ${(r.after / 1024).toFixed(0).padStart(4)} KB  skipped, under ${MIN_SAVING * 100}% saving; original stays`); continue }
    tb += r.before; ta += r.after
    console.log(`  ${r.srcRel.padEnd(80)} ${r.from.padEnd(10)} ${(r.before / 1024).toFixed(0).padStart(5)} KB -> ${r.to.padEnd(9)} ${(r.after / 1024).toFixed(0).padStart(4)} KB  ${r.dest}`)
  }
  console.log(`\n  written: ${(tb / 1024).toFixed(0)} KB of originals -> ${(ta / 1024).toFixed(0)} KB of derivatives (${(100 - ta / tb * 100).toFixed(0)}% smaller)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
