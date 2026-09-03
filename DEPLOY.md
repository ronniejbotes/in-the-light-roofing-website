# Deploying

`npm run build` produces `dist/` — a plain directory of static files. Any static
host serves it. Below is what each host needs configured so the site behaves
exactly like the live WordPress one.

Before go-live, read **[NOTES.md](NOTES.md) §1** — there is a security issue on
the current WordPress install that needs handling regardless of this rebuild.

---

## 1. Build

```bash
npm ci
npm run build
npm run verify:build     # must pass — it gates URL, link and SEO parity
```

Publish directory: `dist/`. Build command: `npm run build`.

The build is deterministic: same `content/` in, same `dist/` out. It needs no
network access, so it works in any CI environment.

---

## 2. Required host behaviour

### 2a. Directory indexes

`/services/roof-repairs/` must serve `services/roof-repairs/index.html`.
Netlify, Cloudflare Pages, Vercel, GitHub Pages, Apache and nginx all do this
by default.

### 2b. Trailing slashes

Every canonical URL on this site ends in `/`. The un-slashed form must **301**
to the slashed one, which is what WordPress does today. Most hosts do this
automatically; on Netlify make sure "Pretty URLs" is on.

### 2c. 404 page

`dist/404.html` must be the error document. Netlify and Cloudflare Pages pick it
up automatically. For nginx: `error_page 404 /404.html;`

### 2d. MIME types

Make sure `image/avif` is served for `.avif`. Modern hosts do; older nginx
builds may need:

```nginx
types { image/avif avif; }
```

Without it browsers ignore the AVIF sources and fall back to the originals —
the site still works, just heavier.

---

## 3. Redirects

`static/_redirects` is copied into `dist/` and is in Netlify/Cloudflare Pages
format. **31 rules**, all verified against the live site with `curl`. They
cover:

- the redirects WordPress already serves (front-page slug → `/`,
  `/sitemap.xml` → `/sitemap_index.xml`, feeds → parent page);
- **17 root-level slug redirects** — WordPress 301s the bare slug of every child
  page (`/allentown/` → `/service-area/allentown/`, `/roof-repairs/` →
  `/services/roof-repairs/`, and so on). Without these, URLs that resolve today
  return 404;
- two repairs for links that are broken on the live site (NOTES.md §2e);
- dead WordPress endpoints (`/wp-login.php`, `/xmlrpc.php`, `/wp-admin/*`).

> **Careful:** `/asphalt-shingle-roofing/`, `/roof-inspections/`,
> `/new-roof-installation/` and `/roof-replacement/` are **not** redirects.
> Those bare slugs are live **category archives** that the build renders as real
> pages. Redirecting them would destroy a real page.

### Apache

```apache
RewriteEngine On
RewriteRule ^allentown/?$ /service-area/allentown/ [R=301,L]
# ... one line per rule in static/_redirects
ErrorDocument 404 /404.html
```

### nginx

```nginx
location = /allentown/ { return 301 /service-area/allentown/; }
# ... one location per rule
location ~ ^/(.+)/feed/$ { return 301 /$1/; }
error_page 404 /404.html;
```

### Query-string shortlinks (optional)

WordPress 301s `/?p=<id>` and `/?page_id=<id>` to the permalink. A static
redirect file cannot match query strings. If you want them, a Netlify edge
function or Cloudflare Worker can map them — `content/pages.json` and
`content/posts.json` both carry the WordPress `id` next to the `route`, so the
lookup table is a few lines to generate. These URLs are rarely linked
externally; without this they fall through to the 404 page.

---

## 4. Forms — the one thing that must be wired up

Every form on the live site posts through Forminator to WordPress. There is no
WordPress any more, so **the forms need a handler before go-live**.

Until one is configured they degrade to opening the visitor's mail client with
the enquiry pre-filled, addressed to `info@inthelightroofing.com`. That works,
but it loses conversions and does not fire the ad conversion events.

To wire one up, set `data-endpoint` on the forms in
`build/templates/blocks.mjs` (the `form()` function) to any endpoint that
accepts a `POST` of `FormData`:

```js
`<form class="form" data-itlr-form
   data-endpoint="/.netlify/functions/enquiry"
   data-redirect="/thank-you/"
   data-fallback-email="info@inthelightroofing.com" novalidate>`
```

The fields posted are `name`, `phone`, `email`, `message` and, on the contact
and careers forms, `select`. A hidden `company_website` field is a honeypot —
**reject any submission where it is non-empty.** On success the visitor is sent
to `/thank-you/`, which already exists.

Options that need no server: Netlify Forms, Cloudflare Pages Functions,
Formspree, Basin. Whichever is chosen, make sure the submission still triggers
the Google Ads conversion — that is what the campaigns optimise against.

---

## 5. Recommended headers

```
# long-lived, content-hashed
/assets/build/*   Cache-Control: public, max-age=31536000, immutable
/assets/fonts/*   Cache-Control: public, max-age=31536000, immutable
/assets/img/*     Cache-Control: public, max-age=31536000, immutable

# stable paths, so revalidate
/wp-content/*     Cache-Control: public, max-age=604800

# HTML
/*                Cache-Control: public, max-age=0, must-revalidate

# security
/*  X-Content-Type-Options: nosniff
/*  Referrer-Policy: strict-origin-when-cross-origin
/*  Strict-Transport-Security: max-age=31536000; includeSubDomains
/*  Permissions-Policy: geolocation=(), microphone=(), camera=()
```

The live site already sends HSTS; keep it.

A Content-Security-Policy is worth adding, but it has to allow the third-party
tags the marketing depends on: `googletagmanager.com`, `cdn.callrail.com`,
`clickcease.com`, `cdn.trustindex.io`, `app.fastbots.ai` /
`static.fastbots.ai`, `youtube-nocookie.com`, `maps.google.com`. Test it in
report-only mode first — a CSP that blocks CallRail silently breaks call
attribution.

---

## 6. Cutover checklist

1. Fix the WordPress security issues first (NOTES.md §1) — the old install stays
   reachable until DNS moves.
2. Deploy to a preview URL. Run `npm run verify:build` against the built output
   and click through the templates.
3. Configure the form handler (§4) and submit a real test enquiry end to end,
   including the ad conversion event.
4. Confirm the redirects work on the preview host — especially the 17
   root-level slug ones, which are easy to miss.
5. Check `/sitemap_index.xml` and all four child sitemaps load.
6. Point DNS.
7. In Search Console: no resubmission is needed (same URLs, same sitemap paths),
   but watch Coverage for a fortnight. Use the URL Inspection tool on `/`, a
   service page and a blog post to confirm rendering.
8. Verify GA4, CallRail number swapping and ClickCease are all reporting.
9. Keep the WordPress install offline but backed up for at least a month.

---

## 7. Updating content later

`content/*.json` is the source of truth and is committed. To change copy, edit
the JSON and run `npm run build`.

To re-pull from a still-running WordPress:

```bash
python tools/fetch_elementor_css.py   # section backgrounds live in generated CSS
npm run extract
npm run assets
node tools/images.mjs
npm run build && npm run verify:build
```

If the plan is to keep editing in WordPress long-term, run it headless and treat
this repo as the front end. If not, the JSON is the CMS — and `verify:content`
will stop matching once you intentionally diverge from the captured site, which
is the point at which to retire that check.
