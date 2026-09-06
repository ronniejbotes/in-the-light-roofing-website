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
npm run audit:js       # load pages and check the JavaScript actually runs
```

---

## Why it is captured through a browser, with the cookie

The site runs LiteSpeed Cache with **guest mode**, and that means it serves two
genuinely different documents at the same URL.

A visitor with no `_lscache_vary` cookie gets a **placeholder**: 50 `<script>`
tags but only *one* with a real `src`, twelve more parked on `data-src`, and a
call to `guest.vary.php` that sets the cookie and answers `{"reload":"yes"}`.
The page reloads, and the second request — now carrying the cookie — returns the
**real document**: 75 scripts, 60 of them loading normally, no guest machinery.

A visitor is on the placeholder for a few hundred milliseconds. They spend the
whole visit on the real one. **That is the build worth mirroring**, so
`mirror-browser.mjs` acquires the cookie from `guest.vary.php` before it starts
and keeps one context for the run. Without the cookie it aborts rather than
capture a site whose JavaScript will not run.

### The mistake this replaces

An earlier version captured every page in a *fresh* context, reasoning that a
first-time visitor arrives without the cookie and that the resulting mixed state
— guest HTML, non-guest CSS — was what people actually see. It is not: it is the
moment before the reload, and it froze the placeholder onto all 427 pages.

Nothing in a static mirror performs that reload. `serve.mjs` answers
`guest.vary.php` with `reload:no`, because a static copy has nowhere different to
reload to. So the deferred scripts never loaded: **2 same-origin scripts per page
instead of 33–40**, no `jQuery` handlers, no `elementorFrontend`, no `Swiper` —
every carousel, accordion, tab, popup and mobile menu inert across the whole
site. The visible tell was six badge logos on the homepage sitting on `data-src`
that nothing swapped in, which had been written off as "broken on live too". They
are not: live loads all 18 carousel images.

The lesson is narrow and worth keeping. **Byte-similarity and pixel-similarity
both passed.** The pages were the right size, the right shape, and 99% pixel-
identical, because the placeholder renders nearly the same as the real page. What
differed was what ran afterwards. Check the JavaScript actually executes —
`typeof window.elementorFrontend`, and the count of same-origin `.js` responses
against live — because no diff of the stored bytes will tell you.

`tools/mirror.mjs` is the older HTTP crawler. It acquires the vary cookie too,
but then deliberately fetches *pages* without it, so it has the same defect;
prefer the browser one for anything that will be served.


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

**Reading the document body.** Chromium keeps a response body only while it holds
the resource, and it sometimes evicts the document before `res.text()` is called.
That used to throw, `visit()` bailed before its rewritten write, and the verbatim
copy `store()` had already made stayed on disk — which is how nine pages ended up
serving their CSS, JS and every nav link from the live site. `store()` no longer
writes documents at all; `visit()` owns them, and a copy taken from the *first*
response per URL is kept purely as a fallback for the eviction.

The *first* matters. Before the vary cookie was acquired up front, each page
produced two documents at the same URL — the placeholder and the reload — plus an
iframe. Keeping the last body per URL took the wrong one. With the cookie there is
only one document per page, but the guard costs nothing and what it prevents is
silent.

**Do not size-check against `curl`.** A plain `curl` has no cookie, so it receives
the guest placeholder — a *different, larger* document than the one the mirror now
stores. Mirrored pages are legitimately ~20% smaller than a curl fetch of the same
URL, and that gap is correct rather than a sign of a truncated capture. This
tripped up an earlier pass: the right build was captured by accident, judged
"20% short of live", and reverted. To compare like with like, fetch with the
`_lscache_vary` cookie, or compare rendered behaviour with
`tools/mirror-audit-js.mjs --live`.


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

## Fixes layered on top: `overrides/`

`mirror/` is a record of what the live site serves, so nothing is edited in it.
Fixes live in `overrides/` and are injected into every HTML response by
`build/serve.mjs`:

```bash
npm run dev                 # mirror + fixes (what you review)
OVERRIDES=off npm run dev   # the mirror exactly as captured
```

With `OVERRIDES=off` the served bytes are identical to the committed file —
verified, not assumed. Both files are written to be pasted into WordPress:
the CSS into Elementor → Site Settings → Custom CSS, the JS into a footer
snippet.

**What is in there.**

*Service grid icons.* The six service cards use one Elementor image-box widget,
but the artwork is not one size: four icons are 60×60 and two — roof replacement
and roof inspections — are 330×330. Nothing constrained them, so those two
rendered at full size, swallowing the photograph behind them and making their
cards five times taller than the rest. The two are pinned to 60×60 by attachment
id, which makes all six cards the same height.

The selector is deliberately narrow. A first attempt scoped it to
`.elementor-image-box-wrapper` generally, which also hit the thirteen Service
Area town cards and shrank every town photograph to a thumbnail. Do not widen it.

*Past Work carousel.* It sat in the 1170px container and stepped one slide at a
time. It now spans the viewport and crawls continuously: `autoplay.delay: 0`,
a long `speed`, linear easing and `freeMode`, applied to the Swiper instance
Elementor has already built. The arrows are hidden, since they mean nothing once
it never stops, and `prefers-reduced-motion` leaves the carousel as Elementor
built it.

The script identifies the carousel by content, not by Elementor's generated
element id, which changes whenever the page is re-saved. The certification-badge
strip is also a Swiper on the same page, so the match additionally requires
non-square images larger than 600px — the badges are 450×450 squares.

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
