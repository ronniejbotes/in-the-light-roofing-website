# Notes — decisions, findings, and what needs the client

Everything in this file is either a deliberate difference from the live site, a
problem that exists on the live site today, or a question only In The Light
Roofing can answer.

---

## 1. URGENT — security issues on the live WordPress site

These are on **inthelightroofing.com right now**. They are not caused by this
rebuild and they are not fixed by it: the WordPress install keeps serving the
site until cutover, and the exposure continues until someone acts.

### 1a. Arbitrary PHP execution through the contact form's file upload

Someone has uploaded PHP files through a Forminator file-upload field and the
server **executes them**. Verified on 4 September 2026:

```
GET /wp-content/uploads/forminator/8230_4ddfcf0a11b756c0c2a3006d23a77668/uploads/hL8qv27mdGTb-nx-7f3a9c2e.php
  → 200, text/html, 33 bytes:  Nxploited_Forminator_Sig_7f3a9c2e

GET .../qPEGYxDIhZVs-nx-7f3a9c2e.phar
  → 200, application/octet-stream, 51 bytes:  <?php echo 'Nxploited_Forminator_Sig_7f3a9c2e'; ?>
```

The `.phar` comes back as raw source with its `<?php` tags intact. The `.php`
comes back with the tags gone and only the echoed string left — the server ran
it. There are **12 such files** (`.php`, `.php3`, `.php4`, `.php5`, `.phtml`,
`.phar`), all signed `Nxploited`, which is the marker of an automated exploit
scanner. They are proof-of-concept payloads, but the upload-and-execute path
they prove is real and is open.

**What to do, today, on the live site:**

1. Delete `/wp-content/uploads/forminator/` entirely.
2. Update or remove the Forminator plugin.
3. Block PHP execution under `wp-content/uploads` at the server level.
4. Audit `wp-content/uploads` for anything else written since these appeared,
   and check for unexpected admin users, scheduled tasks and modified core files.
5. Rotate WordPress, hosting and database credentials.

### 1b. Job applicants' CVs and an internal price list are publicly downloadable

The same upload directories are world-readable and **directory listing is on**
(`/wp-content/uploads/forminator/8230_231d5779a1c51cc3ec5a5a5eeffbe707/uploads/`
returns 200). Confirmed reachable by URL with no authentication:

- Four named individuals' CVs submitted through the careers form (PDF/DOCX).
- `PRICE-LIST-2025_july.docx`.

This is personal data belonging to job applicants. It should come down
regardless of the rebuild, and it is worth a conversation about whether it needs
disclosing to the people affected.

**None of these files are copied into this rebuild.** The static site has no
`/wp-content/uploads/forminator/` directory at all.

---

## 2. Deliberate differences from the live site

Everything else was reproduced as-is. These are the exceptions, and each one is
either a repair or a decision worth knowing about.

### 2a. The brand font is now actually loaded

The live site's Elementor kit sets `font-family: "Exo 2"` on every heading and
paragraph, but the font is never delivered — no `@font-face`, and zero requests
to `fonts.googleapis.com` or `fonts.gstatic.com` anywhere on the page. Every
visitor sees their browser's default sans-serif instead.

Exo 2 is now self-hosted (71 KB, both Latin subsets, weights 300–800). **The
site will look different from the live one because of this** — it will look the
way its own design system specifies. If the client prefers the current
rendering, delete the `@font-face` blocks in `src/styles/fonts.css`.

### 2b. A dead staging host was being preloaded on all 427 pages

Every page carries this in `<head>`:

```html
<link rel="preload" as="image"
      href="http://inthelightroofing.zb167wadjd-ez94dq1rz3mr.p.temp-site.link/wp-content/uploads/2024/05/bnr-bg.webp">
```

That host does not resolve, the URL is plain `http://`, and the file 404s. So
every page load spends a request on a failed high-priority image preload. There
are 568 references to that staging host across the site in total, on all 427
pages. All of them are gone here; the LCP preload now points at the real image.

### 2c. The reviews on /past-work/ now actually render

`/past-work/` contains 16 customer reviews in its markup. On the live site the
carousel never initialises: the wrapper computes to **0 × 0 and none of the 16
is visible to anyone** (verified in a browser, not just from the CSS).

They are real, published reviews — the same ones that exist as the testimonial
post type — so they are rendered here as a proper card grid. If the client would
rather they stayed hidden, say so and they come out.

Note: they are plain HTML. **No `Review` or `aggregateRating` structured data is
attached to them, and none should be.** Self-serving review markup on a
business's own pages makes the whole domain ineligible for review rich results.

### 2d. Structured data now identifies the business

The live site has **no `LocalBusiness`, `RoofingContractor` or `Organization`
node anywhere** — 0 of 427 pages. Consequently no page carries the phone number
or address in structured data, and the `Article` nodes on all 192 posts have no
publisher. Yoast is configured with "site represents" set to a *person* named
"Admin", which is why the whole organisation layer is missing.

A `RoofingContractor`/`LocalBusiness` node has been added, built only from facts
already on the site: name, phone, email, street address, service areas, service
list, social profiles, founded 2017, founder Bryson Berard. `FAQPage` markup is
emitted where a page genuinely has a Q&A accordion, and `Service` on the service
pages.

### 2e. Broken links repaired

| URL | On the live site | Here |
|---|---|---|
| `/service-area/roofing-contractors-bethlehem-pa/` | **404**, linked in-content from 4 pages | 301 → `/service-area/roofers-bethlehem-pa/` |
| `/wp-content/uploads/2024/10/resi-17.webp` | **404**, shown as a broken image on `/service-area/easton/` | image omitted — needs re-uploading |
| `/contact` (no trailing slash) | 301 (WordPress) | 301, and the internal link now points at `/contact/` |

### 2f. Two files that differ only by filename case

`Insurance.svg` and `INSURANCE.svg` both exist on the live host and are
different files — the same artwork at 60×60 and 80×80. A case-insensitive
filesystem cannot hold both. Since SVG scales and the rendered size is set in
CSS, they are visually interchangeable: the lowercase URL now 301s to the
uppercase file, so neither URL 404s.

### 2g. Obfuscated email addresses restored

CleanTalk rewrites `info@inthelightroofing.com` to `in**@***************ng.com`
in the page source, including in the visible text on `/contact/`. The real
address is unambiguous from the header and footer `mailto:` links, so the mask
is reversed at extraction. 37 occurrences.

### 2h. Elementor popup buttons

Several CTAs open Elementor popups via `#elementor-action=…popup:open` hrefs.
Those popups are all quote forms and there is no Elementor here, so the buttons
point at `/contact/` instead of a dead fragment.

---

## 3. Needs a decision or an answer

1. **The form handler.** Every form posted to WordPress via Forminator. There is
   no WordPress now. Until an endpoint is configured (see DEPLOY.md §4) the
   forms fall back to opening the visitor's mail client — functional, but not
   what you want in production. This is the one thing that must be wired up
   before go-live.

2. **The hard-coded review counts.** The header says "Based on 237 Reviews"
   (Google) and "Based on 18 Reviews" (Facebook); `/past-work/` says "4.9 rating
   of 39 reviews"; the Trustindex widget on the homepage said 232 at capture
   time. These are baked into the page and already disagree with each other.
   They will keep drifting. Recommendation: let the Trustindex widget report the
   live number and drop the hard-coded ones. Kept as-is for now — changing a
   published claim is the client's call.

3. **Certification and licensing claims.** Eight pages state GAF certification,
   "licensed and insured" and "decades of experience", and six named
   "GAF-certified" experts appear on one page and nowhere else on the site. All
   of this is carried over verbatim. Before it is promoted further it should be
   verified — GAF certification level, PA HICPA registration number, and whether
   those six people are current staff. A HICPA number displayed in the footer is
   a genuine local-SEO signal, but only if it is real.

4. **The legal entity name.** The Facebook profile slug is
   `InthelightcontractingLLC`, which hints at "In the Light Contracting LLC" —
   but a profile slug is not evidence of a registered name, so nothing has been
   recorded. Confirm before putting a legal name or licence number on the site.

5. **`/home/` and `/home-in-the-light-roofing-new-design/`.** Both are live,
   indexable, self-canonicalising **duplicates of the homepage** with identical
   titles and descriptions, and both are in the sitemap. Worse, the main
   navigation's "Home" link points at `/home/`, not `/`, on every page — so the
   site's own nav splits homepage authority three ways.

   Both pages and the nav link are reproduced exactly as they are, because
   changing them changes URLs. **Recommended:** point the nav "Home" link at
   `/`, then 301 both duplicates to `/`. That is a real ranking gain and costs
   nothing, but it changes live URLs, so it needs sign-off.

6. **`/thank-you/` is indexable** and carries the blog's exact title and meta
   description. A form-confirmation page should be `noindex`. Reproduced as-is;
   one line to change when approved.

7. **`/services/asphalt-shingle-roofing/` canonicalises to
   `/asphalt-shingle-roofing/`** — a service page pointing at a thin category
   archive, which is why the service page is excluded from the sitemap.
   Reproduced exactly. Recommended: make it self-canonical.

8. **Copy that reads like a typo.** `New Roof Installtion` (homepage service
   card), `Get a No Cost ROOf REPLACEMENT Estimate` (every blog post sidebar),
   `In the Light Roofing Serving catasauqua` (lower-case town name),
   `Insurance Claim Facilitation Insurance Claim Facilitation` (duplicated H1).
   All reproduced verbatim. Fixing them changes no URL and no ranking signal —
   just say the word.

9. **CleanTalk.** Its bot-detection script (`ct_clicktrue`, served from rotating
   `obseu.*` domains) existed to protect the WordPress forms. With WordPress
   gone it has nothing to protect, so it is recorded in `site.json` but
   **disabled**. The rebuild's forms use a honeypot field instead. Re-enable via
   `cleantalk_enabled` if the new form handler needs it.

---

## 4. Things left exactly as they are

Reproduced byte-for-byte, deliberately, even though they look wrong:

- **Title and description casing.** The homepage uses `In The Light Roofing`
  (capital T) while all 422 other pages use `In the Light Roofing`. Preserved.
- **Tag archives are `noindex, follow` with no canonical** — all 127 of them,
  and absent from the sitemap. Matches Yoast's live behaviour.
- **`og:url` on paginated archives points at the unpaginated parent** while the
  canonical points at the paginated URL. That is what Yoast emits; reproduced
  rather than silently "fixed".
- **`/services/roof-repairs-campaign/` stays `noindex, nofollow`** and stays out
  of the sitemap — it is a paid-ads landing page.
- **`/uncategorized/` stays indexable** with one post and no meta description.
- **The nav's odd information architecture** — Blog sits under About Us →
  Careers → Blog. Preserved link-for-link.

---

## 5. Known limits of this rebuild

- **`/?p=<id>` and `/?page_id=<id>` shortlinks.** WordPress 301s these to the
  permalink. A static redirect table cannot match query strings without listing
  every id. DEPLOY.md §3 has an edge-function version if it matters; otherwise
  they fall through to the 404 page. These URLs are rarely linked externally.
- **Search (`/?s=`)** was server-side and is gone. No page linked to it.
- **Comments** were disabled on the live site; nothing was lost.
- **WordPress srcset variants** (`-300x200`, `-1024x683`, …) are not carried
  over. The originals are, at their exact URLs, and the rebuild generates its
  own responsive sizes. Only the original URLs were ever referenced by pages.
