"""Find crawler-facing files whose URLs were flattened to root-relative.

The mirror rewrites same-origin absolute URLs to root-relative so it runs from
any origin. That is right for a page's own assets and navigation, and wrong for
the handful of files that exist to tell a crawler where things are: both specs
require an absolute URL.

  - sitemaps    a root-relative <loc> is invalid; Google rejects the whole file
  - robots.txt  a relative "Sitemap:" line is ignored
  - RSS feeds   <link> and <atom:link href> identify the site and the feed

KEEP_ABSOLUTE in the mirror tools cannot catch these -- it matches HTML tags
(<link rel=canonical>, og: meta, JSON-LD), and none of those appear here. So
mirror-browser.mjs writes these files verbatim, and this checks that it did.

Usage: python tools/mirror-audit-crawler-urls.py     # exit 1 on any failure
"""
import re
import sys
import pathlib

ORIGIN = "https://inthelightroofing.com"
ROOT = pathlib.Path("mirror")

problems = []
checked = 0


def report(path, label, value):
    problems.append(f"{path}: {label} is not absolute -> {value}")


# --- sitemaps: every <loc> must be an absolute URL at ORIGIN ---------------
for xml in sorted(ROOT.glob("*sitemap*.xml")):
    text = xml.read_text(encoding="utf-8", errors="replace")
    locs = re.findall(r"<loc>([^<]*)</loc>", text)
    if not locs:
        problems.append(f"{xml}: no <loc> elements at all")
        continue
    checked += len(locs)
    for loc in locs:
        if not loc.startswith(ORIGIN):
            report(xml, "<loc>", loc)

# --- robots.txt: the Sitemap directive must be absolute --------------------
robots = ROOT / "robots.txt"
if not robots.exists():
    problems.append("mirror/robots.txt is missing")
else:
    lines = [l for l in robots.read_text(encoding="utf-8").splitlines()
             if l.lower().startswith("sitemap:")]
    if not lines:
        problems.append(f"{robots}: no Sitemap: directive")
    for line in lines:
        checked += 1
        value = line.split(":", 1)[1].strip()
        if not value.startswith(ORIGIN):
            report(robots, "Sitemap:", value)

# --- feeds: <link> and <atom:link href> identify the site and the feed -----
for feed in sorted(ROOT.rglob("feed/index.html")):
    text = feed.read_text(encoding="utf-8", errors="replace")
    if "<rss" not in text and "<feed" not in text:
        continue
    for value in re.findall(r"<link>([^<]*)</link>", text):
        checked += 1
        if not value.startswith(ORIGIN):
            report(feed, "<link>", value)
    for value in re.findall(r'<atom:link[^>]+href="([^"]*)"', text):
        checked += 1
        if not value.startswith(ORIGIN):
            report(feed, "<atom:link href>", value)

print(f"URLs checked: {checked}")
if problems:
    print(f"flattened:    {len(problems)}\n")
    for p in problems[:40]:
        print(f"   {p}")
    if len(problems) > 40:
        print(f"   … and {len(problems) - 40} more")
    sys.exit(1)
print("flattened:    0  - all crawler-facing URLs are absolute")
