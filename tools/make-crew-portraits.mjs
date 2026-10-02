/**
 * Crop the client's colour-graded crew portraits (Google Drive, "In The Light
 * Roofing" folder, 2 Oct 2026: one person each in front of the shop mural,
 * ~1240px square PNGs) to the 3:4 cards of the crew stack (overrides/team.js).
 *
 *   node tools/make-crew-portraits.mjs <folder with the PNGs>
 *
 * Each crop runs from just above the head to the ground (the top quarter of
 * every photo is mural sky, which at card size only shrinks the face), and is
 * centred on where the person stands -- measured by eye from the originals;
 * most stand off to one side of the mural. Written to overrides/assets/crew/ at 600x800 WebP, which covers
 * a ~180px card at 3x.
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'overrides/assets/crew')
const SRC = process.argv[2]
if (!SRC) { console.error('usage: node tools/make-crew-portraits.mjs <folder>'); process.exit(1) }

// source file -> [output name, horizontal centre of the person 0-1, crop top 0-1]
const CREW = [
  ['celebration-blue-white.png', 'crew-01-owner', 0.48],   // Bryson Berard, the owner
  ['electric-blue-mural-with-man.png', 'crew-02', 0.16],
  ['electric-mural-with-team-member.png', 'crew-03', 0.86, 0.17],   // stands tallest in frame
  ['man-beside-mural.png', 'crew-04', 0.19],
  ['man-posing-before-mural.png', 'crew-05', 0.12],
  ['portrait.png', 'crew-06', 0.21],
  ['pride-beneath-electric-skies.png', 'crew-07', 0.22],
]

await mkdir(OUT, { recursive: true })
for (const [file, name, cx, topFrac = 0.25] of CREW) {
  const img = sharp(join(SRC, file))
  const { width: W, height: H } = await img.metadata()
  const top = Math.round(H * topFrac)
  const ch = H - top - Math.round(H * 0.02)
  const cw = Math.round(ch * 3 / 4)
  const left = Math.max(0, Math.min(W - cw, Math.round(cx * W - cw / 2)))
  await img.extract({ left, top, width: cw, height: ch }).resize(600, 800).webp({ quality: 80 }).toFile(join(OUT, name + '.webp'))
  console.log(name, `crop ${cw}x${ch} at ${left},${top}`)
}
