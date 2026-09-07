/**
 * Publish-time SEO pass. Called from build/publish.mjs after declutter.mjs has
 * run and before the override tags are injected.
 *
 *   MODULES below run in order. Each exports any of:
 *     before(ctx)            once, before any page is read
 *     transformDoc(doc, ctx) per HTML document; mutate doc.html
 *     after(ctx)             once, after every page is written (sitemap, robots.txt)
 *   and returns nothing; they report by writing into ctx.report[<module>].
 *
 * Every document is read once, run through every module, and written once --
 * 426 pages at ~500KB each is too much to hold in memory all at once, and
 * reading each file once per module would be 426 x N reads.
 *
 * A missing module is skipped, not fatal, so the pass can be built up one
 * workstream at a time. SEO=off skips the whole pass, which is how to compare
 * against the untouched mirror.
 *
 * Nothing in here needs node_modules: the deploy host runs `npm run build`
 * without an install step. Precomputed data lives in build/*.json.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listDocs, SITE, getTitle, getMeta, getCanonical, getRobots, getH1s } from './lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/* Order matters: content edits first (titles/H1s), then meta/schema that read
   the final title, then alt/perf attributes, then links, then the sitemap
   which needs every page's final indexability. */
const MODULES = ['content', 'meta', 'alt', 'perf', 'links', 'sitemap']

export async function seo(OUT, opts = {}) {
  const ctx = {
    OUT,
    SITE,
    PUBLIC: !!opts.public,
    /** url -> { file, title, description, canonical, robots, h1s } after all transforms */
    pages: new Map(),
    /** module name -> whatever the module wants to report */
    report: {},
    /** build/image-dims.json: '/assets/...' -> [w, h] */
    dims: existsSync(join(HERE, '..', 'image-dims.json'))
      ? JSON.parse(await readFile(join(HERE, '..', 'image-dims.json'), 'utf8'))
      : {},
  }

  const mods = []
  for (const name of MODULES) {
    const p = join(HERE, `${name}.mjs`)
    if (!existsSync(p)) continue
    const m = await import(`./${name}.mjs`)
    mods.push({ name, ...m })
    ctx.report[name] = {}
  }
  const docs = await listDocs(OUT)
  if (!mods.length) return { modules: [], pages: docs.length }

  for (const m of mods) if (m.before) await m.before(ctx)

  for (const d of docs) {
    const doc = { url: d.url, file: d.file, html: await readFile(d.file, 'utf8') }
    const before = doc.html
    for (const m of mods) if (m.transformDoc) await m.transformDoc(doc, ctx)
    if (doc.html !== before) await writeFile(doc.file, doc.html, 'utf8')
    ctx.pages.set(doc.url, {
      file: doc.file,
      // post | page | archive | testimonial -- set by meta.mjs from the Yoast graph
      kind: doc.kind || 'page',
      // the page's own dateModified, for the sitemap when Yoast had no lastmod
      lastmod: doc.lastmod || null,
      // set by content.mjs when the page's visible content was edited
      edited: doc.edited || null,
      title: getTitle(doc.html),
      description: getMeta(doc.html, 'description'),
      canonical: getCanonical(doc.html),
      robots: getRobots(doc.html),
      h1s: getH1s(doc.html),
    })
  }

  for (const m of mods) if (m.after) await m.after(ctx)

  return { modules: mods.map((m) => m.name), pages: docs.length, report: ctx.report }
}
