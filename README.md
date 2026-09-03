# inthelightroofing.com — static rebuild

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
| CSS shipped | 337 KB | **8.9 KB gzip** |
| JS shipped (first load) | 1 418 KB | **2.8 KB gzip** |
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

### Motion

Scroll reveals use one `IntersectionObserver` and animate only `opacity` and
`transform`. Content ships visible; the class that hides it is added by JS only
after confirming the visitor has not asked for reduced motion, so a script
failure can never leave the page blank. `prefers-reduced-motion` disables
everything.

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
