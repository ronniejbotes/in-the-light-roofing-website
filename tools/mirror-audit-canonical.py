"""Find mirrored pages that were actually redirects on the live site.

page.goto() follows redirects, so a URL that 301s gets saved with the target's
content under the source's path. That is wrong twice over: the source stops
being a redirect, and the target's content is duplicated at a second URL, which
is a canonical conflict.

A page's own canonical tag names the URL it believes it is. Where that
disagrees with the path it was saved at, the capture followed a redirect.

Pages with no canonical at all are split two ways, because the two mean opposite
things. Yoast deliberately omits the canonical on a noindex archive, so the 127
/tag/ pages having none is correct and not worth a line of output. A page that is
INDEXABLE and still has no canonical is unclaimed, and that is worth knowing.
Note this site's markup mixes single and double quotes, so both patterns match
either.

Usage: python tools/mirror-audit-canonical.py
"""
import re
import pathlib

ORIGIN = "https://inthelightroofing.com"
ROOT = pathlib.Path("mirror")

mismatched = []
missing_indexable = []
missing_noindex = 0

NOINDEX = re.compile(r"""<meta[^>]+name=['"]robots['"][^>]*content=['"][^'"]*noindex""", re.I)
CANONICAL = re.compile(r"""<link[^>]+rel=['"]canonical['"][^>]*href=['"]([^'"]+)""", re.I)

for path in ROOT.rglob("index.html"):
    parent = path.parent.relative_to(ROOT).as_posix()
    rel = "/" if parent == "." else "/" + parent + "/"
    try:
        html = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        continue

    # Feeds are RSS saved as index.html. They carry neither a canonical nor a
    # robots meta by nature, so they are not pages this check has anything to say
    # about.
    if html.lstrip().startswith("<?xml") or "<rss" in html[:400]:
        continue

    m = CANONICAL.search(html)
    if not m:
        if NOINDEX.search(html):
            missing_noindex += 1      # expected: Yoast omits it on noindex pages
        else:
            missing_indexable.append(rel)
        continue

    canon = m.group(1).replace(ORIGIN, "") or "/"
    if not canon.endswith("/") and "." not in canon.rsplit("/", 1)[-1]:
        canon += "/"
    if canon != rel:
        mismatched.append((rel, canon))

print(f"pages checked:                {sum(1 for _ in ROOT.rglob('index.html'))}")
print(f"no canonical, noindex (fine): {missing_noindex}")
print(f"no canonical, INDEXABLE:      {len(missing_indexable)}")
for r in sorted(missing_indexable):
    print(f"   {r}")
print(f"canonical != own path:        {len(mismatched)}")
for rel, canon in sorted(mismatched)[:40]:
    print(f"   {rel}")
    print(f"      canonical says {canon}")
