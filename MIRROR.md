# The mirror

`mirror/` is a byte-faithful static copy of the live WordPress site at
**https://inthelightroofing.com/** — every page at its own URL, every asset it
references, and the redirects the live site serves.

It exists because the earlier hand-built rebuild in `src/` had drifted into a
redesign: different hero image, different type, a form the live site does not
have, and stray copy referencing the wrong town. The brief was a clone, so this
captures the real thing instead of re-interpreting it.

```bash
npm run dev            # serve the mirror at http://127.0.0.1:4321
npm run mirror:browser # re-capture every page
npm run check:mirror   # load all pages, report broken assets and JS errors
npm run verify:mirror  # pixel-diff a sample against the live site
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

**Defects reproduced faithfully.** Two things are broken on the live site and
are mirrored as-is rather than quietly repaired:

- `/service-area/roofing-contractors-bethlehem-pa/` — linked in-content, 404s.
- `/wp-content/uploads/2024/10/resi-17.webp` — referenced by
  `/service-area/easton/`, 404s.

Both are worth fixing at source in WordPress.
