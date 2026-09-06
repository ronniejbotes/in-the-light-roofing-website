# inthelightroofing.com

This repo now holds **two** different things. Read this first, or the rest of
the document will mislead you.

### 1. `mirror/` — the faithful clone (current work)

A byte-faithful static copy of the live site: every page at its own URL, every
asset, the redirects the live site serves. This is what `npm run dev` serves and
what is being worked on now.

**See [MIRROR.md](MIRROR.md)** for how it is captured, why it has to be driven
through a real browser, and what does not work (forms need PHP).

```bash
npm run dev            # serve the clone at http://127.0.0.1:4322
npm run check:mirror   # load every page, report broken assets and JS errors
npm run verify:mirror  # pixel-diff a sample against the live site
```

### 2. `src/` + `content/` + `build/` — the earlier hand-built rebuild

Everything below this line describes an earlier attempt: a hand-written
HTML/CSS reconstruction that built to `dist/`. It is much faster than the live
site, but it had drifted into a *redesign* rather than a copy — different hero
image, different typography, a hero form the live site does not have, and copy
referencing the wrong town. It is kept for its performance work and its
extracted content, and is **not** what the site currently is.

Its build still runs via `npm run build` and is served by `npm run serve`.

---

# The earlier static rebuild

A static rebuild of the live WordPress site at **https://inthelightroofing.com/**,
captured 3–4 September 2026.

Same URLs, same copy, same brand — rebuilt as hand-written HTML/CSS with a small
build step, so it loads in a fraction of the time. **No page was renamed, no
content was rewritten, and nothing was invented.**

| | Live WordPress | This rebuild |
|---|---:|---:|
| Homepage, first load | 116 requests, 4 167 KB | **23 requests, 638 KB** |
| Homepage LCP | 2 516 ms | **612 ms** |
| Service page, first load | 97 requests, 2 560 KB | **16 requests, 527 KB** |
| Service page LCP | 2 020 ms | **328 ms** |
| Blog post LCP | 1 900 ms | **208 ms** |
| CSS shipped | 337 KB | **12.1 KB gzip** |
| JS shipped (first load) | 1 418 KB | **3.2 KB gzip** |
| Average page HTML | 245 KB (home) | **37 KB** |

Measured with a headless Chromium at 1440×900 against both sites — see
`tools/compare.mjs` and `tools/initial.mjs` to re-run.

---

## What is here

- **427 HTML pages** — every URL that returns 200 on the live site.
- **31 redirects** in `static/_redirects`, reproducing the ones WordPress
  serves today plus two repairs for links that are broken on the live site.
- **Sitemaps and feed** at the same paths Yoast uses (`/sitemap_index.xml` and
  its four child sitemaps), so nothing in Search Console needs resubmitting.
- **All original images** under their original `/wp-content/uploads/…` paths,
  plus AVIF/WebP derivatives that browsers actually download.

| Template | Pages |
|---|---:|
| Blog posts | 192 |
| Tag archives (`/tag/*`, noindex — as on the live site) | 127 |
| Paginated archives (`*/page/N/`) | 34 |
| Category archives (at the root: `/roof-repair/`, `/roofing/`, …) | 19 |
| Testimonials (`/testimonial/*`) | 17 |
| Standalone pages | 14 |
| Service areas (`/service-area/*`) | 13 |
| Services (`/services/*`) | 10 |
| Home | 1 |

---

## Getting started

```bash
npm install
npm run build        # Vite bundles CSS/JS, then renders all 427 pages to dist/
npm run serve        # preview at http://127.0.0.1:4321 (honours _redirects)
```

### The full pipeline

Content is extracted from the live WordPress site once and committed to
`content/*.json`. You only need to re-run the extraction steps when the live
site changes.

```bash
npm run extract      # WP REST + captured HTML -> content/*.json
npm run assets       # download every /wp-content/ file the build references
node tools/images.mjs        # AVIF/WebP derivatives -> static/assets/img/
node tools/fetch-posters.mjs # YouTube poster frames -> static/assets/video/
npm run build
npm run check        # build + verify
```

### Verification

Two checks guard the two promises this rebuild makes.

```bash
npm run verify:content   # every word of live body copy is present in content/
npm run verify:build     # every live URL resolves; every link works; SEO matches
```

`verify:content` compares the visible body text of all 245 captured content
pages against what we extracted, word by word. It currently reports **0 missing
words**.

`verify:build` checks three things and exits non-zero on any failure:

1. **URL parity** — every URL that returns 200 on the live site exists in
   `dist/` or is covered by a redirect.
2. **Link integrity** — all 49 608 internal links and asset references resolve.
3. **SEO parity** — `<title>`, meta description, meta robots and canonical
   match the live site exactly, on all 426 comparable pages (1 704 fields).

There is also a browser sweep:

```bash
node build/serve.mjs &
node tools/qa.mjs        # console errors, 404s, H1 count, overflow, alt/dimensions
```

---

## How it is built

There is no framework and no client-side routing. Vite builds one small
CSS/JS bundle; a Node script renders the HTML.

```
content/*.json          extracted content — the source of truth
  ├─ pages.json         37 pages as ordered content blocks
  ├─ posts.json         192 posts
  ├─ testimonials.json  16 reviews
  ├─ categories.json    19 category archives
  ├─ tags.json          127 tag archives
  ├─ media.json         766 media records
  ├─ images.json        responsive derivative manifest
  └─ site.json          nav, footer, NAP, third-party tag ids

build/
  build.mjs             routes + writes all 427 pages
  lib/                  html helpers, schema graph, sitemaps, site constants
  templates/
    layout.mjs          <head>, header, footer, third-party tags
    sections.mjs        turns block lists into laid-out sections
    blocks.mjs          renders each block type

src/                    Vite entry — styles/ and scripts/
  styles/surfaces.css   the blueprint grounds, photo scrims and accent band
static/                 copied verbatim into dist/ (images, fonts, _redirects)
tools/                  extraction, asset fetching, image processing, verifiers
```

### Content model

Elementor pages were flattened into an ordered list of typed blocks — `heading`,
`richtext`, `image`, `button`, `feature`, `list`, `accordion`, `gallery`,
`video`, `map`, `form`, `reviews`, `testimonials`, `carousel`. Every one of the
**1 758 Elementor widgets** on the site is accounted for: 1 732 became blocks
and 26 are children of widgets that render their own contents. None was dropped.

`build/templates/sections.mjs` classifies each section by what it contains and
picks a layout — feature grid, numbered process, FAQ, split, hero, contact
panel. Block order is always preserved.

### Styling

`src/styles/tokens.css` holds the design tokens, all read from the live site's
own Elementor kit: brand cyan `#00B6F1`, dark `#14161E`, Exo 2, the 66/48/18px
type scale and its 1366/1024/767 breakpoints, 25px pill buttons, 1170px
container.

Exo 2 is now self-hosted. The live site declares it everywhere but never loads
it — there is no `@font-face` and no request to Google Fonts — so every visitor
currently sees a system sans-serif instead of the brand face.

### The visual system

The brand is the live site's. What is new is the structure the brand is set in,
and it is deliberately narrow: three surfaces, one accent moment, one voice for
every micro-label.

**Surfaces** (`src/styles/surfaces.css`). Dark bands are drawn as a blueprint —
a near-black field, a hairline grid, and a sparse lattice of crosshair survey
marks — because that is the drawing a roof gets specified on, so it belongs to
this business rather than being borrowed decoration. It is CSS gradients plus
one inline SVG tile: no requests, and nothing repaints during scroll. The weave
is masked out through the middle of each band so it frames the copy instead of
sitting behind it, and photographic bands get it at 55% so it reads as an
overlay rather than a defect.

**One accent band per page.** The numbered process section — the part a visitor
is actually trying to understand — becomes a vivid cyan band with a single roof
chevron drawn across it. `renderSections` picks it: the first section on the
page that classifies as a numbered process, and no more than one.

**Panels own their colours.** Cards, form panels, quotes and accordions carry
their own surface, so they declare their own text, heading and link colours and
never inherit them from the band they land in. That replaces a set of
`:not(.card *, …)` guards that had to be extended every time a component was
added, and it is why a feature card can move from a white section to a dark one
by swapping `.card--flat` for `.card--glass` and nothing else.

**Micro-labels.** Section kickers, card actions, breadcrumbs, article meta,
pagination, form labels, footer column headings and the top bar's ratings are
all set in the system monospace at the same tracking. It costs no request, and
the fixed advance width is what makes a row of small caps read as a rule rather
than as leftover text.

**Section numbering.** Each band above the hero carries a two-digit index. It
adds no words of its own — nothing is invented — but it gives a long page a
spine. Pages with fewer than three bands do not get it; a lone "01" is
decoration, not structure.

### Motion

Scroll reveals use one `IntersectionObserver` and animate only `opacity` and
`transform`. Content ships visible; the class that hides it is added by JS only
after confirming the visitor has not asked for reduced motion, so a script
failure can never leave the page blank.

On top of that: section kickers draw their own rule, headings' rules wipe in the
direction the eye reads, photographs settle from a 1.5% scale, and the header
carries a reading-progress hairline driven by `animation-timeline: scroll()`
where the browser supports it — composited off the main thread — with a
`requestAnimationFrame` fallback that only ever writes one custom property.

`prefers-reduced-motion` disables all of it, including the marquee.

### Images

Originals stay at their exact original URLs so anything already indexed or
hotlinked keeps working. AVIF and WebP derivatives at 480/768/1200/1800 are
offered ahead of them via `<picture>`, and section backgrounds get the same
treatment through `image-set()`. Every image carries width/height, and the LCP
preload points at the same candidate the browser will pick.

### Third-party tags

GTM, CallRail, ClickCease, Trustindex and the Fastbots chat widget are carried
over with the same ids, but they load on a timer or first interaction rather
than on page load — the same thing LiteSpeed was doing on the live site. The
chat widget alone is ~1.6 MB. See `src/scripts/third-party.js`.

---

## Read next

- **[DEPLOY.md](DEPLOY.md)** — host configuration, redirects, headers, and the
  form handler that needs wiring up before go-live.
- **[NOTES.md](NOTES.md)** — every deliberate difference from the live site,
  problems found on the live site, and the decisions that need the client.
  **It opens with a security issue on the live WordPress install that needs
  attention now, before any of this ships.**
