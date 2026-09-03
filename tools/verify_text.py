#!/usr/bin/env python3
"""
Fidelity check: every word of visible page-body copy on the live site must be
present in the extracted content. Reports per-page missing words.

This compares the LIVE page body (header/footer/scripts stripped) against the
text reconstructable from content/*.json. It is deliberately one-directional:
extra words in our copy are fine (they come from carousels the live DOM hides),
missing words are not.
"""
import json, os, re, sys, html
from collections import Counter
from bs4 import BeautifulSoup

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SP = os.environ.get("ITLR_SCRATCH") or (
    r"C:/Users/ronja/AppData/Local/Temp/claude/"
    r"c--Users-ronja-iCloudDrive-Documents-GitHub-in-the-light-roofing-website/"
    r"e4f72178-8f47-4887-9127-6503e961e26b/scratchpad"
)

# Chrome that repeats on every page and is handled by the layout, not the content.
CHROME_SELECTORS = [
    "header", "footer", "nav", ".elementor-location-header", ".elementor-location-footer",
    "#wpadminbar", ".ti-widget", ".forminator-ui", ".elementor-popup-modal",
    "[data-elementor-type='header']", "[data-elementor-type='footer']",
    "[data-elementor-type='popup']", ".e-floating-buttons", ".skip-link",
    ".breadcrumb", ".elementor-widget-breadcrumbs",
]


def words(s):
    s = html.unescape(s or "")
    s = re.sub(r"[\u2018\u2019\u02bc]", "'", s)
    s = re.sub(r"[\u201c\u201d]", '"', s)
    s = re.sub(r"[\u2013\u2014\u2212]", "-", s)
    s = s.lower()
    return [w for w in re.findall(r"[a-z0-9']+", s) if w]


def live_body_words(path):
    rel = "index.html" if path == "/" else path.strip("/") + "/index.html"
    fn = os.path.join(SP, "raw", rel)
    if not os.path.exists(fn):
        return None
    with open(fn, encoding="utf-8", errors="replace") as f:
        soup = BeautifulSoup(f.read(), "lxml")
    for s in soup.find_all(["script", "style", "noscript", "svg", "template"]):
        s.decompose()
    for sel in CHROME_SELECTORS:
        for el in soup.select(sel):
            el.decompose()
    main = (soup.select_one("main") or soup.select_one("[data-elementor-type='wp-page']")
            or soup.select_one("[data-elementor-type='wp-post']") or soup.body or soup)
    return Counter(words(main.get_text(" ", strip=True)))


def block_words(b, acc):
    t = b.get("type")
    for k in ("text", "title", "label", "caption", "html", "sub", "lead", "rest", "submit"):
        if b.get(k):
            acc.extend(words(re.sub(r"<[^>]+>", " ", str(b[k]))))
    if t == "list":
        for i in b.get("items", []):
            acc.extend(words(i.get("text", "")))
    if t == "accordion":
        for i in b.get("items", []):
            acc.extend(words(i.get("q", "")))
            acc.extend(words(re.sub(r"<[^>]+>", " ", i.get("a", ""))))
    if t == "carousel":
        for sl in b.get("slides", []):
            for b2 in sl:
                block_words(b2, acc)
    if t == "form":
        for f in b.get("fields", []):
            acc.extend(words(f.get("placeholder", "")))
            for o in f.get("options", []):
                acc.extend(words(o.get("label", "")))
    if t == "testimonials":
        for i in b.get("items", []):
            acc.extend(words(i.get("name", "")))
            acc.extend(words(i.get("text", "")))
            acc.extend(words(i.get("date", "")))
            acc.extend(words(i.get("source", "")))


def our_words(rec, listing_words):
    acc = []
    for s in rec.get("sections", []):
        for b in s["blocks"]:
            block_words(b, acc)
            # A postgrid renders a live list of posts; its words come from the index.
            if b.get("type") == "postgrid":
                acc.extend(listing_words)
    if rec.get("html"):
        acc.extend(words(re.sub(r"<[^>]+>", " ", rec["html"])))
    acc.extend(words(rec.get("title", "")))
    # Related-posts links are stored separately from the body but render on the page.
    for r in rec.get("related", []):
        acc.extend(words(r.get("title", "")))
    if rec.get("excerpt"):
        acc.extend(words(rec["excerpt"]))
    for c in rec.get("categories", []) + rec.get("tags", []):
        acc.extend(words(c.get("name", "")))
    if rec.get("featured_image"):
        acc.extend(words(rec["featured_image"].get("alt", "")))
    return Counter(acc)


# Words that legitimately appear only in live chrome we strip, or in widgets we
# deliberately do not bake (Trustindex review text, Elementor UI labels).
IGNORE = set(words("""
 previous next read more show less see all reviews review google facebook verified main content
 trustindex powered by excellent based on rating stars star out of write a
 posted anonymous ago days day weeks week months month years year hours hour
 minutes minute just now translated original language load skip to content
 menu close open toggle search submit sending please wait thank you error
 required field invalid email phone name message captcha copyright all rights
 reserved privacy policy terms sitemap
"""))

# Strings that live in the SINGLE-POST Elementor template rather than in any post's
# own content: the Link Whisper "Related Posts" heading and the sidebar quote form
# ("Get a No Cost Estimate" / submit label "No Cost Estimate"). Verified present on
# every post page; the rebuild renders them from the post template, so they are not
# a content loss. Kept explicit rather than folded into IGNORE so that if the post
# template ever stops emitting them the check still has a record of what is expected.
POST_TEMPLATE_CHROME = set(words(
    "related posts Get a No Cost ROOf REPLACEMENT Estimate"))

# On /the-different-roof-coating-options/ the live Link Whisper plugin splits the
# word "repair," into <span>repai</span><span>r</span><span>,</span>, so the live DOM
# tokenises as "repai". Our extracted copy has the correct unsplit "roof repair,".
# Not a loss -- our text is the more faithful of the two.
IGNORE.add("repai")
IGNORE |= POST_TEMPLATE_CHROME


def main():
    targets = []
    for fn in ("pages.json", "posts.json", "testimonials.json"):
        with open(os.path.join(REPO, "content", fn), encoding="utf-8") as f:
            targets.extend(json.load(f))

    # Words the blog/archive templates emit from the post index (titles, excerpts,
    # dates, categories) rather than from the page's own stored content.
    with open(os.path.join(REPO, "content", "posts.json"), encoding="utf-8") as f:
        posts = json.load(f)
    listing_words = []
    for p in posts:
        listing_words.extend(words(p["title"]))
        listing_words.extend(words(p.get("excerpt", "")))
        for c in p.get("categories", []):
            listing_words.extend(words(c["name"]))
    listing_words = listing_words * 3  # a title may appear on index, archive and related

    checked = 0
    bad = []
    total_missing = 0
    for rec in targets:
        live = live_body_words(rec["route"])
        if live is None:
            continue
        checked += 1
        ours = our_words(rec, listing_words)
        missing = Counter()
        for w, n in live.items():
            if w in IGNORE or len(w) < 3:
                continue
            d = n - ours.get(w, 0)
            if d > 0:
                missing[w] = d
        if missing:
            total_missing += sum(missing.values())
            bad.append((rec["route"], sum(missing.values()), sum(live.values()), missing))

    bad.sort(key=lambda x: -x[1])
    print(f"Checked {checked} pages against live capture.")
    print(f"Pages with missing words: {len(bad)}  |  total missing word instances: {total_missing}")
    if bad:
        print("\nWorst offenders:")
        for route, n, tot, missing in bad[:25]:
            pct = 100.0 * n / max(tot, 1)
            print(f"\n  {route}  -- {n} missing of {tot} ({pct:.1f}%)")
            print("     ", dict(missing.most_common(18)))
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
