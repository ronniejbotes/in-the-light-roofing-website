# Notes — decisions, findings, and what needs the client

Everything in this file is either a deliberate difference from the live site, a
problem that exists on the live site today, or a question only In The Light
Roofing can answer.

---

## 1. URGENT — security issues on the live WordPress site

These are on **inthelightroofing.com right now**. They are not caused by this
rebuild and they are not fixed by it: the WordPress install keeps serving the
site until cutover, and the exposure continues until someone acts.

### 1a. The site is compromised — a webshell still executes today

Someone uploaded script files through a Forminator file-upload field and the
server **executes them**. First verified 4 September 2026; re-checked and still
live on 6 September 2026.

**Specifics are deliberately not written here — see below.** Twelve attacker
files sit in one Forminator upload folder across six extensions (`.php`, `.php3`,
`.php4`, `.php5`, `.phtml`, `.phar`), all carrying the signature of a known
automated exploit kit.

Execution is proven by a control case rather than inferred: the `.phar` sibling
returns its `<?php` source intact as `application/octet-stream`, while the `.php`
returns only the echoed output with the tags gone. The server ran the file.

**This is not only proof-of-concept.** One of the twelve is a password-gated
"Admin Login" form. Its source — readable through the non-executing `.phar`
sibling — shows an MD5 password gate that on success fetches a payload from a
public GitHub repository and `eval()`s it into the running site. That remote
payload still returns HTTP 200 and is roughly 62 KB. This is a functioning
backdoor, not a calling card.

The uploads arrived in **two waves, 22 and 24 August 2026** (the later confirmed
by a `last-modified` header, the earlier from the REST media endpoint and worth
confirming against filesystem timestamps). Something came back two days later and
re-confirmed the hole, which is what automated tooling does when a host stays
open.

**What to do, on the live site, in this order:**

0. **Before deleting anything**, copy the applicant CVs and the price list off
   the webroot — they are personal data and may be the client's only copy — and
   preserve the twelve files with their filesystem timestamps. Those timestamps
   are the only record of when this began, and step 1 destroys them.
1. Maintenance mode. Delete `/wp-content/uploads/forminator/` entirely.
2. Update or remove Forminator.
3. Deny PHP execution anywhere under `wp-content/uploads` at server level — an
   `.htaccess` in `uploads` denying `\.(php|php3|php4|php5|phtml|phar)$`.
4. Audit for what a repeat visit may have left: unexpected administrator
   accounts, unexpected WP-Cron entries, files in `wp-includes` / `wp-admin`
   modified since 22 August.
5. Rotate WordPress, hosting and database credentials — **after** the door is
   shut, not before. Rotating first buys false assurance while the server still
   executes uploaded PHP.

Because a working backdoor was reachable for at least two weeks, restoring from a
pre-22-August backup is safer than cleaning in place. That is the client's call,
but put it to them as a call.

---

**Why the exploit path is not written down here.** This repository is public on
GitHub, and until 6 September 2026 this section published the exact filename,
directory hash and payload signature — a working route to remote code execution
on a client site that is still compromised, indexed and searchable by anyone
looking for exactly that string. The specifics now live only in the local,
gitignored audit report (`audit-live-site.md`), which is not committed. Do not
paste them back into any file in this repo while it is public.

### 1b. Job applicants' CVs and an internal price list are publicly downloadable

**Correction (6 Sep 2026): directory listing is already OFF, and turning it off
would therefore fix nothing.** `/wp-content/uploads/` returns a LiteSpeed 404,
and the Forminator folders return HTTP 200 with `content-length: 0` — an empty
`index.html`, not a listing. The files are reachable by two other routes:

- `/wp-json/wp/v2/media?media_type=application` publishes an index of them
  (`x-wp-total: 9`), and
- `/?attachment_id=<id>` redirects straight to a file, so nobody needs to know
  the random folder hash.

Each file also has a public attachment permalink whose slug contains the
applicant's surname, so a name is exposed in the URL string itself. `robots.txt`
has no `Disallow` for `/wp-content/uploads/`.

Still reachable with no authentication, re-checked 6 September 2026:

- Eight resumes belonging to four named job applicants (PDF/DOCX). One sampled
  returned HTTP 200, 67,774 bytes.
- The company's internal price list (filename withheld here — see the local
  audit report) — HTTP 200, 110,972 bytes.

**Delete the attachment records, not just the files.** `/wp-json/wp/v2/media`
reads `wp_posts`; removing the files from disk leaves the media entries still
publishing the ids, filenames and applicant surnames. In WP Admin, Media Library
→ Bulk Select → Delete Permanently for attachment IDs **8875, 9523, 9632, 9830,
9831, 9872, 10151, 10152, 10153**, then confirm `x-wp-total` drops to 0.

There is no attachment sitemap in `sitemap_index.xml`, so these were never
actively submitted to Google — the exposure is reachability, not confirmed
indexing. After deleting, check Search Console and file a Removals request for
anything that appears.

**On the legal framing, be careful.** Pennsylvania's breach-notification statute
keys on a name combined with a Social Security number, driver's licence or
financial account number. A resume alone may not trigger a statutory duty. None
of these documents were opened, deliberately, so nobody knows what is in them.
Put it to the client as confidential applicant data exposed on the open web and a
decision they make knowingly — do not assert a legal obligation.

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

The URL is plain `http://` and the file 404s, so every page load spends a
request on a failed high-priority image preload. There are 568 references to that
staging host across the site in total, on all 427 pages. All of them are gone
here; the LCP preload now points at the real image.

**Correction (6 Sep 2026).** An earlier version of this note said the host does
not resolve. It does: `nslookup` returns 3.23.6.147 and the root returns HTTP 200
serving the hosting provider's "Website Unavailable" placeholder. Every asset
path under it 404s, which is what matters, but the host is a live placeholder
rather than a dead DNS record.

The preload is the least of it. The same hostname is stored in the WordPress
database and reaches the served HTML in two more places: the `og:image` meta tag
on **49 pages**, and the Yoast JSON-LD `ImageObject` (`url`, `contentUrl`,
`thumbnailUrl`) on **31 pages**. All five staging URLs 404; all five files serve
200 from the real domain at identical paths. So every time someone shares a
service or town page — Facebook, WhatsApp, iMessage, Nextdoor — the link preview
comes back with no photo. Fix it in WordPress with Better Search Replace or
`wp search-replace` (not raw SQL: Elementor stores serialised postmeta and the
`s:NN:` length prefixes must be rewritten).

### 2c. The reviews on /past-work/ now actually render

`/past-work/` contains 16 customer reviews in its markup. On the live site none
of the 16 is visible to anyone, at any screen size.

**Correction (6 Sep 2026).** The observed outcome was right; the cause recorded
here was wrong. It is not a carousel failing to initialise. The wrapper section
`cb80e2d` carries all seven of Elementor's responsive-hide classes at once —
`elementor-hidden-widescreen` through `elementor-hidden-mobile` — so it is
`display:none` at every breakpoint, deliberately. That changes the fix from
debugging a script to unticking seven checkboxes under Advanced → Responsive.

It also explains the alt-text finding: 112 of the 123 `<img>` tags on the live
page have no `alt`, and all 112 sit inside this hidden section. Writing alt text
for them before unhiding it would be wasted work.

Do not simply unhide it. The newest of the 16 reviews is dated 20/03/2024 and
eleven predate 2024; publishing a proof page whose freshest review is two years
old reads worse than no page. Refresh the reviews first, and settle the
conflicting counts (see §3.2) — the header says 237 and 18, this section says 39.

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

### 2i. The homepage FAQ no longer asks every question twice

Elementor renders the FAQ accordion twice into the same DOM — once for the
desktop breakpoint and once for mobile — and the extraction picked up both. All
nine questions were therefore appearing twice in a row. Identical questions now
collapse to their first occurrence (`dedupeQA` in `build/templates/blocks.mjs`).
Nothing unique is dropped: only exact repeats of a question already shown.

### 2j. The "Contact Us Now" carousel is a marquee

The band between the reviews and the founder's story is a six-slide Elementor
image carousel where every slide contains the same "Contact Us Now" heading. On
the live site the slides are told apart by container background images and a 3°
rotation, neither of which is a widget, so neither survived extraction — leaving
six identical slides and a pair of arrows to page between them.

Every slide's text and link is preserved; they render as a single scrolling band
of CTA pills instead of a carousel. It pauses on hover, the duplicate track used
to make the loop seamless is `aria-hidden` and out of the tab order, and
`prefers-reduced-motion` turns it into a plain scrollable row.

### 2k. The reviews slot is no longer empty until Trustindex loads

Trustindex is a deferred third-party script (README, "Third-party tags"), so
the homepage reviews
section painted as ~400px of nothing and stayed that way for any visitor whose
browser blocked it. The slot now ships with three of the site's own testimonials
rendered server-side, clipped, each linking to the full review. If the widget
mounts, `src/scripts/reviews.js` hides them.

No star ratings or review sources are attached to those cards — the testimonial
records do not carry either, and inventing them would be both false and a
structured-data problem (see 2d).

### 2l. Photographs are no longer rendered as 28px icons

The service-area cards use an Elementor icon-box whose "icon" is a photograph of
the town, at 495x484. The service cards use the same widget with a 512x512 white
glyph. Dimensions cannot tell those two apart, so `tools/images.mjs` now measures
transparency into `content/images.json` (`glyph: true`): a mark drawn to sit on a
coloured tile is mostly transparent, a photograph is not. On this site the two
populations sit at 48-70% and 0-4%, so the threshold is not delicate.

Glyphs render in a cyan disc, as they do on the live site. Photographs get the
full width of their card.

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

3. **Two console errors that come from your Google Tag Manager container, not
   from this site.** Both reproduce on the live site as well:

   - `jQuery is not defined` — a custom HTML tag inside `GTM-NSS7NJ4W` runs
     jQuery. WordPress happened to have jQuery on the page; nothing here does,
     and nothing should ship 90KB of it for one tag. The tag needs rewriting in
     plain JavaScript, or removing. It is in your GTM container, so it is a
     change you make there.
   - `Duplicated clickcease <script/> found` — ClickCease is loaded both by this
     site's own tag and by a tag in the GTM container. One of the two should go.
     We cannot see inside the container to tell which, so both are left in place.

4. **Certification and licensing claims.** Eight pages state GAF certification,
   "licensed and insured" and "decades of experience", and six named
   "GAF-certified" experts appear on one page and nowhere else on the site. All
   of this is carried over verbatim. Before it is promoted further it should be
   verified — GAF certification level, PA HICPA registration number, and whether
   those six people are current staff. A HICPA number displayed in the footer is
   a genuine local-SEO signal, but only if it is real.

5. **The legal entity name.** The Facebook profile slug is
   `InthelightcontractingLLC`, which hints at "In the Light Contracting LLC" —
   but a profile slug is not evidence of a registered name, so nothing has been
   recorded. Confirm before putting a legal name or licence number on the site.

6. **`/home/` and `/home-in-the-light-roofing-new-design/`.** Both are live,
   indexable, self-canonicalising **duplicates of the homepage** with identical
   titles and descriptions, and both are in the sitemap. Worse, the main
   navigation's "Home" link points at `/home/`, not `/`, on every page — so the
   site's own nav splits homepage authority three ways.

   Both pages and the nav link are reproduced exactly as they are, because
   changing them changes URLs. **Recommended:** point the nav "Home" link at
   `/`, then 301 both duplicates to `/`. That is a real ranking gain and costs
   nothing, but it changes live URLs, so it needs sign-off.

7. **`/thank-you/` is indexable** and carries the blog's exact title and meta
   description. A form-confirmation page should be `noindex`. Reproduced as-is;
   one line to change when approved.

8. **`/services/asphalt-shingle-roofing/` canonicalises to
   `/asphalt-shingle-roofing/`** — a service page pointing at a thin category
   archive, which is why the service page is excluded from the sitemap.
   Reproduced exactly. Recommended: make it self-canonical.

9. **Copy that reads like a typo.** `New Roof Installtion` (homepage service
   card), `Get a No Cost ROOf REPLACEMENT Estimate` (every blog post sidebar),
   `In the Light Roofing Serving catasauqua` (lower-case town name),
   `Insurance Claim Facilitation Insurance Claim Facilitation` (duplicated H1).
   All reproduced verbatim. Fixing them changes no URL and no ranking signal —
   just say the word.

10. **CleanTalk.** Its bot-detection script (`ct_clicktrue`, served from rotating
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
