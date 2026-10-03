/**
 * Rebuild the hero crew cutouts around a different photograph. The same 715x568
 * cutout of the old crew photo exists under three names: the desktop
 * service/town hero (2026/01/banner-overlay-img.webp), the phone hero and the
 * careers/roof-types pages (2024/03/banner.png.webp), and an old homepage
 * draft (2024/05/our-roof-projects.webp). Each is rebuilt from its own mask.
 *
 *   node tools/make-banner-overlay.mjs <photo> [focusY 0-1]
 *
 * The original is a 715x568 photo with its top-left corner cut away on a
 * diagonal and a cyan rule along the cut and the left edge, all baked into one
 * transparent WebP that every service page's Elementor CSS points at. Rather
 * than rewrite 59 stylesheets, this keeps the original's shape exactly: its
 * alpha channel becomes the new photo's mask, and its cyan pixels are laid
 * back on top. The output lands in overrides/replace/, which build/publish.mjs
 * copies over the mirror's file at the same path.
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UPLOADS = join(ROOT, 'mirror/wp-content/uploads')
const TARGETS = [
  ['2026/01', 'banner-overlay-img', '.webp'],
  ['2024/03', 'banner', '.png.webp'],
  ['2024/05', 'our-roof-projects', '.webp'],
]
const [, , photo, focus = '0.5'] = process.argv
if (!photo) { console.error('usage: node tools/make-banner-overlay.mjs <photo> [focusY]'); process.exit(1) }

const SCALE = 2   // the hero renders it up to ~675px wide; 2x keeps it sharp on retina
for (const [dir, base, ext] of TARGETS) {
  const orig = sharp(join(UPLOADS, dir, base + ext)).ensureAlpha()
  const { width: W0, height: H0 } = await orig.metadata()
  const W = W0 * SCALE, H = H0 * SCALE
  const o = await orig.resize(W, H, { kernel: 'lanczos3' }).raw().toBuffer()

  // Cover-crop the new photo to the frame, biased vertically by focusY.
  const meta = await sharp(photo).metadata()
  const k = Math.max(W / meta.width, H / meta.height)
  const rw = Math.round(meta.width * k), rh = Math.round(meta.height * k)
  const top = Math.round((rh - H) * Number(focus)), left = Math.round((rw - W) / 2)
  const p = await sharp(photo).resize(rw, rh).extract({ left, top, width: W, height: H }).ensureAlpha().raw().toBuffer()

  // The rule runs along the cut, so only pixels just inside each row's first
  // opaque pixel are candidates. Matching cyan anywhere in the frame would also
  // lift the old photo's blue jackets onto the new one.
  const BAND = 26 * SCALE
  for (let y = 0; y < H; y++) {
    let first = 0
    while (first < W && o[(y * W + first) * 4 + 3] === 0) first++
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const r = o[i * 4], g = o[i * 4 + 1], b = o[i * 4 + 2], a = o[i * 4 + 3]
      const cyan = x < first + BAND && b > 200 && g > 140 && r < 90 && a > 0
      if (cyan) { p[i * 4] = r; p[i * 4 + 1] = g; p[i * 4 + 2] = b }
      p[i * 4 + 3] = a                                       // the original cut
    }
  }

  const OUT_DIR = join(ROOT, 'overrides/replace/assets', dir)
  await mkdir(OUT_DIR, { recursive: true })
  const img = sharp(p, { raw: { width: W, height: H, channels: 4 } })
  await img.clone().webp({ quality: 80, alphaQuality: 90 }).toFile(join(OUT_DIR, base + ext))
  await img.clone().resize(300).webp({ quality: 80 }).toFile(join(OUT_DIR, base + '-300x238' + ext))
  console.log(`wrote ${dir}/${base}${ext} (${W}x${H}) from ${photo}`)
}
