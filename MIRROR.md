# The mirror

`mirror/` is a byte-faithful static copy of the live WordPress site at
**https://inthelightroofing.com/** — every page at its own URL, every asset it
references, and the redirects the live site serves.

It exists because the earlier hand-built rebuild in `src/` had drifted into a
redesign: different hero image, different type, a form the live site does not
have, and stray copy referencing the wrong town. The brief was a clone, so this
captures the real thing instead of re-interpreting it.

```bash
npm run dev            # serve the mirror at http://127.0.0.1:4322
npm run mirror:browser # re-capture every page
npm run check:mirror   # load all pages, report broken assets and JS errors
npm run verify:mirror  # pixel-diff a sample against the live site
npm run audit:mirror   # static checks: route coverage, canonicals, crawler URLs
```

---

## Why it is captured through a browser

The obvious approach — fetch each URL with an HTTP client and save the bytes —
produces a mirror that renders subtly wrong, and the reason took a while to
find.

The site runs LiteSpeed Cache with **guest mode**. A visitor with no
`_lscache_vary` cookie is served a stripped "guest" build of the page. Its
JavaScript then calls `guest.vary.php`, which sets the cookie, and the *next*
request gets a different build. Crucially, **the same CSS URL serves different
bytes depending on that cookie**.

So a plain `fetch()` captures a self-consistent but wrong combination: guest
HTML paired with guest CSS. A real browser ends up in a mixed state — the HTML
arrives before the cookie exists, the stylesheet request goes out after it does.
That mixture is what visitors actually see.

The symptom was a header rendering 81px shorter than live, which shifted every
pixel below it and dragged whole pages below the similarity bar, while the HTML
and CSS files compared byte-identical. `.elementor-icon-box-wrapper` computed to
`display:flex` locally and `display:block` on live, from what looked like the
same stylesheet.

`tools/mirror-browser.mjs` therefore drives a real Chromium, **one fresh context
per page**, and saves whatever the browser received. A fresh context matters:
reuse one and the cookie carries over from page two onward, handing you the
non-guest build again.

`tools/mirror.mjs` is the older HTTP-based crawler. It is faster and still
useful for discovering URLs, but it captures the guest build — prefer the
browser one for anything that will be served.

---

## The route manifest

`routes.txt` at the repo root lists every URL the mirror must contain, and is the
input to a full `npm run mirror:browser`. It is **tracked on purpose**.

Before it existed, the capture list lived in `shots/all-routes.txt` and the build's
own inventory in `.routes.json` — and both are gitignored. So the definition of
"the whole site" was not in version control: a fresh clone could not run a full
capture, and nothing compared the list against reality. That is how the 127 `/tag/`
archives sat outside the mirror without any check noticing. They are real pages,
they return 200, and the capture list simply never mentioned them.

Lines beginning with `#` are comments. `mirror-browser.mjs`, `mirror-check.mjs`
and `mirror-verify.mjs` all read it, and all still accept explicit routes as
arguments or a different file via `ROUTES_FILE`.

`tools/mirror-audit-routes.mjs` compares the manifest against the mirror in both
directions, and is the check that was missing:

- **listed but not mirrored** — a URL the capture failed to fetch.
- **mirrored but not listed** — a page that will go stale, because the next full
  capture will not re-fetch it.

Pass `--live` to also HEAD every URL against the live site; it is slow and paced
deliberately, because this WordPress install returns errors under load. Every
other check the repo had took the capture list as its definition of "the whole
site", so none of them could ever notice a URL the list had never mentioned.

---

## Guards worth knowing about

**Server error pages.** Under crawl load this WordPress install answers with a
`Database Error` page — at HTTP 200. An early run baked 17 of those into the
mirror as if they were real pages. `mirror-browser.mjs` now rejects any document
carrying a server-error marker or falling under `MIN_PAGE_BYTES` (20 KB; real
pages here are ~450 KB) and records it as a failure to retry. Keep `TABS` low
(1–2) when re-running, and re-run failures rather than accepting them.

**Redirects.** `page.goto()` follows redirects, so a URL that 301s gets saved
with the *target's* content under the *source's* path — the redirect disappears
and the content is duplicated at two URLs. `tools/mirror-audit-canonical.py`
catches this by comparing each page's own canonical tag against the path it was
saved at. Verified live redirects live in `mirror/_redirects`, which
`build/serve.mjs` replays.

**Which build gets captured.** Three document responses arrive per page: the real
build that `page.goto()` returns, LiteSpeed's guest-mode reload of the *same URL*
about 20% smaller, and any iframe. `res.text()` on `page.goto()`'s own response is
the right one. Capturing from the `response` event keyed by URL takes the reload
instead, which shrinks pages by ~95 KB while still looking like a clean capture —
compare a page's byte size against live if you ever suspect it.

Chromium also keeps a response body only while it holds the resource, and sometimes
evicts the document before `res.text()` is called. That used to throw, `visit()`
bailed before its rewritten write, and the verbatim copy `store()` had already
written stayed on disk — which is how nine pages ended up serving their CSS, JS and
every nav link from the live site. `store()` no longer writes documents at all, and
a copy taken from the *first* response per URL is kept purely as a fallback.

**Assets the browser never requests.** Sitemaps, `robots.txt` and feeds are not
linked from any page, so a crawl alone misses them; they are fetched directly.
`tools/mirror-fill.mjs` is the backstop — it scans every mirrored page and
stylesheet for same-origin references and fetches whatever is missing from disk.
Run it after any capture.

---

## What is deliberately not rewritten

Asset and navigation URLs are rewritten to root-relative so the mirror runs from
any origin. **Identity metadata is left absolute**: `<link rel="canonical">`,
`og:`/`twitter:` tags, `rel="alternate"`, and the whole JSON-LD graph. Rewriting
those would tell a crawler every page is the homepage and strip the schema of
the `@id` values that tie its entities together. An early version of the rewrite
did exactly that; the `KEEP_ABSOLUTE` list in both mirror tools prevents it.

**The crawler-facing files are not rewritten at all.** The five sitemaps,
`robots.txt` and `/comments/feed/` exist to tell a crawler where things are, and
both specs require an absolute URL to do it: a root-relative `<loc>` makes the
whole sitemap invalid, and a relative `Sitemap:` line in `robots.txt` is ignored.
`KEEP_ABSOLUTE` was no help here — it matches HTML tags, and there are none in an
XML sitemap — so the rewrite flattened all 270 of those URLs before this was
caught. `mirror-browser.mjs` now writes these files verbatim, and
`tools/mirror-audit-crawler-urls.py` fails the build if anything flattens them
again.

**A bare origin becomes `/`, not nothing.** The strip loop used to replace the
origin with an empty string, so a URL that was *just* the origin — the Essential
Addons breadcrumb's "Home" link — became `href=""`, which a browser resolves to
the current document. 178 pages had a Home link that reloaded the page the visitor
was already on. The with-path form is now parked under a sentinel first, so only
the bare form is left to become `/`.

---

## Known gaps

**Forms do not submit.** The contact forms are Forminator, posting to
`/wp-admin/admin-ajax.php`. That needs PHP, and a static mirror has none. The
forms render identically and validate client-side, but submission fails. Fixing
it needs a decision about where this ends up:

- WordPress stays the backend, and the forms post to it cross-origin — needs
  CORS headers added on the WordPress side.
- The static site replaces WordPress, and the forms move to a static form
  service or a small endpoint of our own.

Nothing else on the page depends on PHP: the chat widget, Trustindex reviews,
reCAPTCHA and CallRail all load from external domains and keep working.

**Stubbed endpoints.** `build/serve.mjs` answers two PHP endpoints the mirrored
JavaScript calls, because leaving them to 404 throws a JSON parse error that
kills the rest of that script bundle:

- `guest.vary.php` → `{"reload":"no"}` (live says `yes`; a static copy has
  nothing to reload to)
- CallRail's `rest_route=/Calltrk/` beacon → `{}`

**Defects reproduced faithfully.** These are wrong on the live site and are
mirrored as-is rather than quietly repaired:

- `/service-area/roofing-contractors-bethlehem-pa/` — linked in-content, 404s.
- `/wp-content/uploads/2024/10/resi-17.webp` — referenced by
  `/service-area/easton/`, 404s.
- `/wp-content/uploads/2024/09/aero-down.webp` — referenced as a background image
  by LiteSpeed's own generated CSS, 404s. Nothing in page HTML asks for it, which
  is why only the asset backstop finds it.
- `/services/asphalt-shingle-roofing/` returns 200 but canonicalises to
  `/asphalt-shingle-roofing/`, so it asks Google to credit the category archive
  instead of the service page. `mirror-audit-canonical.py` flags it; it is
  faithful, verified against live. Worth fixing at source — a service page
  should be its own canonical.

All four are worth fixing in WordPress.

`/services/roof-repairs-campaign/` also has no canonical, but it carries
`noindex, nofollow` and is a campaign landing page, so that is correct rather
than a defect — Yoast omits the canonical on noindex pages by design. It is
recorded here only because a first pass mistook it for a problem: the robots
meta is single-quoted, and a `name="robots"` grep does not find it.
