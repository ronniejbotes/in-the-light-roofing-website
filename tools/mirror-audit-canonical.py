"""Find mirrored pages that were actually redirects on the live site.

page.goto() follows redirects, so a URL that 301s gets saved with the target's
content under the source's path. That is wrong twice over: the source stops
being a redirect, and the target's content is duplicated at a second URL, which
is a canonical conflict.

A page's own canonical tag names the URL it believes it is. Where that
disagrees with the path it was saved at, the capture followed a redirect.

Usage: python tools/mirror-audit-canonical.py
"""
import re
import pathlib

ORIGIN = "https://inthelightroofing.com"
ROOT = pathlib.Path("mirror")

mismatched = []
missing_canonical = []

for path in ROOT.rglob("index.html"):
    parent = path.parent.relative_to(ROOT).as_posix()
    rel = "/" if parent == "." else "/" + parent + "/"
    try:
        html = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        continue

    m = re.search(r'<link rel="canonical" href="([^"]+)"', html)
    if not m:
        missing_canonical.append(rel)
        continue

    canon = m.group(1).replace(ORIGIN, "") or "/"
    if not canon.endswith("/") and "." not in canon.rsplit("/", 1)[-1]:
        canon += "/"
    if canon != rel:
        mismatched.append((rel, canon))

print(f"pages checked:                {sum(1 for _ in ROOT.rglob('index.html'))}")
print(f"no canonical tag (feeds etc): {len(missing_canonical)}")
for r in sorted(missing_canonical)[:10]:
    print(f"   {r}")
print(f"canonical != own path:        {len(mismatched)}")
for rel, canon in sorted(mismatched)[:40]:
    print(f"   {rel}")
    print(f"      canonical says {canon}")
