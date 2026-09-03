#!/usr/bin/env python3
"""
Fetch the per-page Elementor CSS and pull out the section-level presentation
that lives there rather than in the markup: background images, background
colours and text colour overrides, keyed by Elementor element id.

Elementor renders `<div class="elementor-element elementor-element-<id>">` in
the HTML and puts the matching `background-image:url(...)` in a generated
stylesheet, so a rebuild that only reads the markup loses every section
background. Output: scratchpad/elementor-styles.json  { "<element id>": {...} }
"""
import json, os, re, sys, urllib.request, gzip
from concurrent.futures import ThreadPoolExecutor

SP = os.environ.get("ITLR_SCRATCH") or (
    r"C:/Users/ronja/AppData/Local/Temp/claude/"
    r"c--Users-ronja-iCloudDrive-Documents-GitHub-in-the-light-roofing-website/"
    r"e4f72178-8f47-4887-9127-6503e961e26b/scratchpad"
)
SITE = "https://inthelightroofing.com"
HDR = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0",
       "Accept-Encoding": "gzip"}
CACHE = os.path.join(SP, "elementor-css")
os.makedirs(CACHE, exist_ok=True)


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 200:
        return open(dest, encoding="utf-8", errors="replace").read()
    try:
        req = urllib.request.Request(url, headers=HDR)
        with urllib.request.urlopen(req, timeout=90) as r:
            data = r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                data = gzip.decompress(data)
            text = data.decode("utf-8", "replace")
            open(dest, "w", encoding="utf-8").write(text)
            return text
    except Exception as e:
        print(f"  miss {url}: {e}", file=sys.stderr)
        return ""


def rel(u):
    u = u.strip().strip("'\"")
    for h in (SITE, "http://inthelightroofing.com"):
        if u.startswith(h):
            return u[len(h):]
    # The live CSS also references a dead staging host; normalise it back to a
    # site-relative path so the rebuild never points at temp-site.link.
    m = re.match(r"https?://[a-z0-9.-]*temp-site\.link(/.*)", u, re.I)
    if m:
        return m.group(1)
    return u


RULE = re.compile(r"([^{}]+)\{([^{}]*)\}")
ELEM = re.compile(r"\.elementor-element-([a-z0-9]+)\b")


def parse(css):
    """element id -> {background, background_color, color} (last rule wins)."""
    out = {}
    for sel, body in RULE.findall(css):
        ids = set(ELEM.findall(sel))
        if not ids:
            continue
        # Only take rules that target the element itself, not a descendant
        # widget inside it, so a section's background is not confused with a
        # button's.
        info = {}
        m = re.search(r"background-image:\s*url\(([^)]+)\)", body)
        if m and "data:" not in m.group(1):
            info["background"] = rel(m.group(1))
        m = re.search(r"background-color:\s*([^;]+)", body)
        if m:
            info["background_color"] = m.group(1).strip()
        if not info:
            continue
        for eid in ids:
            # Selectors that dive into a child widget describe that widget.
            tail = sel.split(f"elementor-element-{eid}")[-1]
            if re.search(r"\.elementor-(widget|button|icon|heading|image)", tail):
                continue
            out.setdefault(eid, {}).update(info)
    return out


def main():
    pages = json.load(open(os.path.join(SP, "api", "pages.json"), encoding="utf-8"))
    ids = [p["id"] for p in pages]
    # The Elementor "kit" holds sitewide defaults; header/footer templates too.
    ids += [7, 11, 13]

    styles = {}

    def one(pid):
        url = f"{SITE}/wp-content/uploads/elementor/css/post-{pid}.css"
        css = fetch(url, os.path.join(CACHE, f"post-{pid}.css"))
        return parse(css) if css else {}

    with ThreadPoolExecutor(max_workers=6) as ex:
        for d in ex.map(one, ids):
            for k, v in d.items():
                styles.setdefault(k, {}).update(v)

    dest = os.path.join(SP, "elementor-styles.json")
    json.dump(styles, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    withbg = sum(1 for v in styles.values() if v.get("background"))
    print(f"Parsed {len(ids)} stylesheets -> {len(styles)} elements "
          f"({withbg} with a background image). Wrote {dest}")


if __name__ == "__main__":
    main()
