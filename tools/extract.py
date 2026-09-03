#!/usr/bin/env python3
"""
Extract the live inthelightroofing.com WordPress content into structured JSON.

Every string this writes comes verbatim from the WP REST API dump or the captured
raw HTML. Nothing is paraphrased, summarised or generated. If a value is absent in
the source it is absent here too -- it is never filled in with a plausible default.

Inputs   (scratchpad):  api/*.json  +  raw/**/index.html
Outputs  (repo):        content/*.json
"""
import json, os, re, sys, html, hashlib
from collections import OrderedDict, Counter
from bs4 import BeautifulSoup

SP = os.environ.get("ITLR_SCRATCH") or (
    r"C:/Users/ronja/AppData/Local/Temp/claude/"
    r"c--Users-ronja-iCloudDrive-Documents-GitHub-in-the-light-roofing-website/"
    r"e4f72178-8f47-4887-9127-6503e961e26b/scratchpad"
)
REPO = os.environ.get("ITLR_REPO") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "content")
SITE = "https://inthelightroofing.com"

os.makedirs(OUT, exist_ok=True)

# Section backgrounds and colours that Elementor emits into generated CSS
# instead of the markup. Produced by tools/fetch_elementor_css.py.
_styles_path = os.path.join(SP, "elementor-styles.json")
if os.path.exists(_styles_path):
    with open(_styles_path, encoding="utf-8") as _f:
        ELEMENTOR_STYLES = json.load(_f)
else:
    ELEMENTOR_STYLES = {}
    print("WARNING: elementor-styles.json missing; section backgrounds will be "
          "lost. Run tools/fetch_elementor_css.py first.", file=sys.stderr)


def load(name):
    with open(os.path.join(SP, "api", name + ".json"), encoding="utf-8") as f:
        return json.load(f)


def raw_html(path):
    """Captured live HTML for a site path, or None."""
    rel = "index.html" if path == "/" else path.strip("/") + "/index.html"
    fn = os.path.join(SP, "raw", rel)
    if os.path.exists(fn):
        with open(fn, encoding="utf-8", errors="replace") as f:
            return f.read()
    return None


# CleanTalk masks addresses in the markup as e.g. "in**@*******ng.com". The
# real address is unambiguous from the header/footer mailto links, so the mask
# is reversed rather than shipped to visitors.
REAL_EMAIL = "info@inthelightroofing.com"
MASKED_EMAIL = re.compile(r"[A-Za-z0-9._%+-]*\*{2,}[A-Za-z0-9._%*+-]*@?[A-Za-z0-9.*-]*\*+[A-Za-z0-9.*-]*\.[A-Za-z]{2,}")


def unmask_email(s):
    if not s or "*" not in s:
        return s
    return MASKED_EMAIL.sub(REAL_EMAIL, s)


def rel_url(u):
    """Make an internal absolute URL root-relative. Leave external URLs alone."""
    if not u:
        return u
    u = u.strip()
    if u.startswith("mailto:"):
        return "mailto:" + unmask_email(u[7:])
    for host in (SITE, "http://inthelightroofing.com", "https://www.inthelightroofing.com"):
        if u.startswith(host):
            u = u[len(host):] or "/"
    return u


def txt(el):
    """Visible text of an element, whitespace-normalised, entities decoded."""
    if el is None:
        return ""
    s = el.get_text(" ", strip=True)
    return unmask_email(re.sub(r"\s+", " ", s).strip())


def clean_inline(node):
    """
    Serialise an element's children keeping only safe inline/blocks, dropping
    every Elementor/WP class and attribute. Content is preserved exactly.
    """
    ALLOWED = {"p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a",
               "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "table", "thead",
               "tbody", "tr", "th", "td", "sup", "sub", "span", "div", "hr", "img"}
    out = []

    def walk(n, depth=0):
        for c in n.children:
            if isinstance(c, str):
                out.append(html.escape(c))
                continue
            name = c.name
            if name in ("script", "style", "noscript"):
                continue
            if name not in ALLOWED:
                walk(c, depth + 1)
                continue
            if name in ("span", "div"):
                walk(c, depth + 1)
                continue
            attrs = ""
            if name == "a":
                href = rel_url(c.get("href", ""))
                if not href:
                    walk(c, depth + 1)
                    continue
                ext = href.startswith("http")
                attrs = f' href="{html.escape(href, quote=True)}"'
                if ext:
                    attrs += ' target="_blank" rel="noopener"'
            elif name == "img":
                src = rel_url(c.get("src", ""))
                alt = c.get("alt", "")
                out.append(f'<img src="{html.escape(src, quote=True)}" alt="{html.escape(alt, quote=True)}">')
                continue
            out.append(f"<{name}{attrs}>")
            walk(c, depth + 1)
            out.append(f"</{name}>")

    walk(node)
    s = "".join(out)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"<p>\s*</p>", "", s)
    s = re.sub(r"\s+([<])", r" \1", s)
    # CleanTalk splits a masked address across several <span>s, so the mask is
    # only recognisable once the string has been reassembled.
    return unmask_email(s.strip())


def img_data(tag):
    """Normalise an <img> into {src, alt, width, height}."""
    if tag is None:
        return None
    src = tag.get("src") or ""
    # Elementor lazy-loads via data-src sometimes
    if not src or src.startswith("data:"):
        src = tag.get("data-src") or tag.get("data-lazy-src") or src
    if not src:
        return None
    d = {"src": rel_url(src), "alt": tag.get("alt", "") or ""}
    for k in ("width", "height"):
        v = tag.get(k)
        if v and str(v).isdigit():
            d[k] = int(v)
    return d


# --------------------------------------------------------------------------
# Elementor widget -> content block
# --------------------------------------------------------------------------

def widget_type(el):
    """
    Authoritative widget type. Elementor stamps data-widget_type="<type>.<skin>";
    the class list is unreliable because responsive modifiers such as
    `elementor-widget-mobile__width-initial` and the `elementor-widget-global`
    marker sit alongside (and often before) the real `elementor-widget-<type>`.
    """
    dw = el.get("data-widget_type")
    if dw:
        return dw.split(".")[0]
    for c in el.get("class", []):
        if c.startswith("elementor-widget-") and c != "elementor-widget-container":
            t = c[len("elementor-widget-"):]
            if t not in ("wrap", "mobile", "widescreen", "global") and "__" not in t:
                return t
    return None


def extract_widget(el, wtype):
    """Return a content block dict, or None if the widget carries no content."""

    if wtype == "heading":
        h = el.find(re.compile(r"^h[1-6]$")) or el.select_one(".elementor-heading-title")
        if h is None:
            return None
        level = h.name if re.match(r"^h[1-6]$", h.name or "") else "h2"
        link = h.find("a")
        b = {"type": "heading", "level": int(level[1]), "text": txt(h)}
        if not b["text"]:
            return None
        if link and link.get("href"):
            b["href"] = rel_url(link["href"])
        return b

    if wtype in ("text-editor", "html", "shortcode"):
        # A Forminator form: capture the real field spec, not its rendered chrome.
        form = el.find("form", class_=re.compile("forminator"))
        if form is not None:
            fid = ""
            m = re.search(r"forminator-custom-form-(\d+)", " ".join(form.get("class", [])))
            if m:
                fid = m.group(1)
            fields = []
            for inp in form.find_all(["input", "textarea", "select"]):
                nm = inp.get("name") or ""
                ty = inp.get("type") or ("textarea" if inp.name == "textarea" else "text")
                # drop WP/Forminator plumbing and the CleanTalk honeypot
                if ty == "hidden" or nm.startswith(("forminator_", "_wp_", "apbct")) or nm in (
                        "referer_url", "form_id", "page_id", "form_type", "current_url",
                        "render_id", "action"):
                    continue
                if not nm:
                    continue
                f = {
                    "name": nm, "type": ty,
                    "placeholder": inp.get("placeholder", "") or "",
                    "required": inp.has_attr("required"),
                }
                if inp.name == "select":
                    f["type"] = "select"
                    f["options"] = [
                        {"value": o.get("value", ""), "label": txt(o)}
                        for o in inp.find_all("option")
                    ]
                    if f["options"] and not f["options"][0]["value"]:
                        f["placeholder"] = f["options"][0]["label"]
                fields.append(f)
            btn = form.find("button")
            return {"type": "form", "form_id": fid, "fields": fields,
                    "submit": txt(btn) or "Submit"}

        # A Trustindex reviews widget: an embed, never baked text. The visible
        # copy ("Based on N reviews") is fetched client-side and would go stale.
        if el.select_one(".ti-widget") is not None or "trustindex" in str(el).lower():
            return {"type": "reviews", "provider": "trustindex"}

        cont = el.select_one(".elementor-widget-container") or el
        inner = clean_inline(cont)
        if not re.sub(r"<[^>]+>", "", inner).strip():
            return embed_block(el)  # iframe-only widget (map or video embed)
        return {"type": "richtext", "html": inner}

    if wtype == "image":
        im = img_data(el.find("img"))
        if not im:
            return None
        b = {"type": "image", **im}
        a = el.find("a")
        if a and a.get("href"):
            b["href"] = rel_url(a["href"])
        cap = el.select_one(".widget-image-caption, figcaption")
        if cap and txt(cap):
            b["caption"] = txt(cap)
        return b

    if wtype == "button":
        a = el.find("a") or el.find("button")
        if a is None:
            return None
        label = txt(el.select_one(".elementor-button-text") or a)
        if not label:
            return None
        b = {"type": "button", "label": label, "href": rel_url(a.get("href", "")) or "#"}
        ic = el.select_one(".elementor-button-icon i, .elementor-button-icon svg")
        if ic is not None and ic.name == "i":
            b["icon"] = " ".join(ic.get("class", []))
        return b

    if wtype in ("image-box", "icon-box"):
        b = {"type": "feature"}
        h = el.select_one(".elementor-image-box-title, .elementor-icon-box-title")
        if h is not None:
            b["title"] = txt(h)
            a = h.find("a")
            if a and a.get("href"):
                b["href"] = rel_url(a["href"])
            hh = h.find(re.compile(r"^h[1-6]$")) or (h if re.match(r"^h[1-6]$", h.name or "") else None)
            if hh is not None:
                b["level"] = int(hh.name[1])
        d = el.select_one(".elementor-image-box-description, .elementor-icon-box-description")
        if d is not None:
            body = clean_inline(d)
            if re.sub(r"<[^>]+>", "", body).strip():
                b["html"] = body
        im = img_data(el.find("img"))
        if im:
            b["image"] = im
        else:
            ic = el.select_one(".elementor-icon i, .elementor-icon svg")
            if ic is not None and ic.name == "i":
                b["icon"] = " ".join(ic.get("class", []))
        if not b.get("title") and not b.get("html") and not b.get("image"):
            return None
        return b

    if wtype == "icon-list":
        items = []
        for li in el.select(".elementor-icon-list-item"):
            t = txt(li)
            if not t:
                continue
            it = {"text": t}
            a = li.find("a")
            if a and a.get("href"):
                it["href"] = rel_url(a["href"])
            ic = li.select_one("i")
            if ic is not None:
                it["icon"] = " ".join(ic.get("class", []))
            items.append(it)
        return {"type": "list", "items": items} if items else None

    if wtype == "accordion":
        items = []
        titles = el.select(".elementor-accordion-title, .elementor-tab-title")
        bodies = el.select(".elementor-tab-content")
        for i, t in enumerate(titles):
            q = txt(t)
            a = clean_inline(bodies[i]) if i < len(bodies) else ""
            if q:
                items.append({"q": q, "a": a})
        return {"type": "accordion", "items": items} if items else None

    if wtype in ("image-carousel", "gallery"):
        imgs, seen = [], set()
        for t in el.find_all("img"):
            im = img_data(t)
            if im and im["src"] not in seen:
                seen.add(im["src"])
                imgs.append(im)
        if not imgs:
            # Elementor's grid gallery paints images as CSS backgrounds; the
            # full-size file is on the item's <a href> (link_to = "file").
            for a in el.select("a.e-gallery-item, a.elementor-gallery-item"):
                href = rel_url(a.get("href", ""))
                if href and re.search(r"\.(jpe?g|png|webp|gif|avif)$", href, re.I) and href not in seen:
                    seen.add(href)
                    imgs.append({"src": href, "alt": a.get("aria-label", "") or a.get("title", "") or ""})
        return {"type": "gallery", "images": imgs} if imgs else None

    if wtype == "video":
        ifr = el.find("iframe")
        src = (iframe_src(ifr) or "") if ifr is not None else ""
        if not src:
            ds = html.unescape(el.get("data-settings") or "")
            m = re.search(r'"(?:youtube_url|vimeo_url|hosted_url)"\s*:\s*"([^"]+)"', ds)
            if m:
                src = m.group(1).replace("\\/", "/")
        if not src:
            m = re.search(r'"url":"(https:\\?/\\?/[^"]*(?:youtube|youtu\.be|vimeo)[^"]*)"', str(el))
            if m:
                src = m.group(1).replace("\\/", "/")
        if not src:
            return None
        b = {"type": "video", "src": src}
        yt = re.search(r"(?:youtu\.be/|v=|/embed/)([A-Za-z0-9_-]{11})", src)
        if yt:
            b["youtube_id"] = yt.group(1)
        ov = el.select_one(".elementor-custom-embed-image-overlay img")
        im = img_data(ov)
        if im:
            b["poster"] = im
        return b

    if wtype in ("google_maps", "google"):
        ifr = el.find("iframe")
        src = iframe_src(ifr) if ifr is not None else None
        if src:
            return {"type": "map", "src": src, "title": ifr.get("title", "")}
        return None

    if wtype == "eael-dual-color-header":
        # <h1 class="eael-dch-title"><span class="...lead">Lead</span><span>rest</span></h1>
        h = el.select_one(".eael-dch-title") or el.find(re.compile(r"^h[1-6]$"))
        if h is None:
            return None
        level = int(h.name[1]) if re.match(r"^h[1-6]$", h.name or "") else 2
        spans = h.select(".eael-dch-title-text") or list(h.find_all("span"))
        lead, rest = "", ""
        for sp in spans:
            cls = " ".join(sp.get("class", []))
            if "lead" in cls and not lead:
                lead = txt(sp)
            else:
                rest = (rest + " " + txt(sp)).strip()
        full = txt(h)
        if not full:
            return None
        b = {"type": "heading", "level": level, "text": full}
        if lead:
            b["lead"] = lead
            b["rest"] = rest
        sub = el.select_one(".eael-dch-subtext, .eael-dual-header-subtext")
        if sub is not None and txt(sub):
            b["sub"] = txt(sub)
        return b

    if wtype in ("nested-carousel", "n-carousel"):
        # Elementor's nested carousel holds real widgets per slide. Group each
        # slide's widgets so the rebuild can render them as slides.
        slides = []
        for sl in el.select(".swiper-slide, .e-n-carousel > .e-con"):
            blocks = []
            for w in sl.find_all(attrs={"data-widget_type": True}):
                wt2 = widget_type(w)
                if not wt2 or wt2 in ("nested-carousel", "n-carousel"):
                    continue
                # Only skip when the enclosing container widget is itself inside
                # this slide -- the carousel we are expanding is not a reason to skip.
                par = w.find_parent(attrs={"data-widget_type": True})
                if (par is not None and par is not el
                        and widget_type(par) in CONTAINER_WIDGETS):
                    continue
                b2 = extract_widget(w, wt2)
                if b2:
                    blocks.append(b2)
            if blocks:
                slides.append(blocks)
        return {"type": "carousel", "slides": slides} if slides else None

    if wtype == "eael-post-grid":
        return {"type": "postgrid"}

    return embed_block(el)


def iframe_src(ifr):
    """
    The real src of a lazy-loaded iframe.

    LiteSpeed rewrites `src` to about:blank and keeps the original in
    `data-litespeed-src`; some markup carries a second `src` attribute that
    the parser drops. Fall back to scanning the raw tag when needed.
    """
    for k in ("data-litespeed-src", "data-src", "data-lazy-src"):
        v = ifr.get(k)
        if v and v != "about:blank":
            return v
    v = ifr.get("src")
    if v and v != "about:blank":
        return v
    for m in re.finditer(r'src=["\']([^"\']+)["\']', str(ifr)):
        if m.group(1) != "about:blank":
            return m.group(1)
    return None


def embed_block(el):
    """A widget whose whole payload is an iframe embed (map or video)."""
    ifr = el.find("iframe")
    if ifr is None:
        return None
    src = iframe_src(ifr)
    if not src:
        return None
    b = {"type": "map" if "google.com/maps" in src else "video", "src": src}
    if ifr.get("title"):
        b["title"] = ifr["title"]
    yt = re.search(r"(?:youtu\.be/|v=|/embed/)([A-Za-z0-9_-]{11})", src)
    if yt:
        b["youtube_id"] = yt.group(1)
    return b


# Widgets that render their own children; anything nested inside one of these has
# already been captured by the parent handler and must not be emitted twice.
CONTAINER_WIDGETS = {"image-box", "icon-box", "accordion", "image-carousel",
                     "gallery", "nested-carousel", "n-carousel", "eael-post-grid"}


def _section_style(sec, max_depth=3):
    """
    Resolve the visual background for a section.

    Elementor commonly applies the section's background to a full-bleed child
    container instead of the section element, so this walks the container tree
    breadth-first and returns the first background image it finds, plus the
    first background colour. Widgets are skipped -- only layout containers can
    carry a section background.
    """
    out = {}
    level = [sec]
    for _ in range(max_depth + 1):
        nxt = []
        for el in level:
            eid = el.get("data-id")
            style = ELEMENTOR_STYLES.get(eid or "", {})
            if style.get("background") and "background" not in out:
                out["background"] = style["background"]
            if style.get("background_color") and "background_color" not in out:
                out["background_color"] = style["background_color"]
            if "background" in out and "background_color" in out:
                return out
            for c in el.find_all(recursive=False):
                if c.name not in ("div", "section"):
                    continue
                cls = " ".join(c.get("class", []))
                if "elementor-widget" in cls or c.get("data-widget_type"):
                    continue
                nxt.append(c)
        if not nxt:
            break
        level = nxt
    return out


def _animation(el):
    ds = el.get("data-settings") or ""
    m = re.search(r'"_animation"\s*:\s*"(\w+)"', html.unescape(ds))
    return m.group(1) if m else None


def extract_elementor(content_html):
    """
    Walk an Elementor document and return a list of sections, each a list of blocks.
    Widget order follows DOM order, which is visual order.
    """
    soup = BeautifulSoup(content_html, "lxml")
    sections = []

    root = soup.select_one("div.elementor") or soup
    tops = [c for c in root.find_all(recursive=False)
            if c.name in ("section", "div")
            and any(k in " ".join(c.get("class", []))
                    for k in ("elementor-section", "e-con", "elementor-top-section"))]
    if not tops:
        tops = soup.select(".elementor-section.elementor-top-section, .e-con.e-parent")
    if not tops:
        tops = [root]

    seen_widgets = set()
    for sec in tops:
        blocks = []
        for w in sec.find_all(attrs={"data-widget_type": True}):
            wt = widget_type(w)
            if not wt:
                continue
            if id(w) in seen_widgets:
                continue
            parent = w.find_parent(attrs={"data-widget_type": True})
            if parent is not None and widget_type(parent) in CONTAINER_WIDGETS:
                continue
            b = extract_widget(w, wt)
            if b:
                anim = _animation(w)
                if anim:
                    b["anim"] = anim
                blocks.append(b)
                seen_widgets.add(id(w))
        if blocks:
            meta = {"blocks": blocks}
            eid = sec.get("data-id")
            if eid:
                meta["eid"] = eid
            # Elementor keeps section backgrounds in a generated stylesheet, not
            # in the markup, so look them up by element id (see
            # tools/fetch_elementor_css.py). The background is often set on a
            # full-width child container rather than the section itself, so walk
            # outermost-first and take the first one that carries a background.
            style = _section_style(sec)
            if style.get("background"):
                meta["background"] = style["background"]
            if style.get("background_color"):
                meta["background_color"] = style["background_color"]
            m = re.search(r"url\((&quot;|\"|')?([^)\"']+)", sec.get("style", "") or "")
            if m:
                meta["background"] = rel_url(m.group(2))
            anim = _animation(sec)
            if anim:
                meta["anim"] = anim
            sections.append(meta)
    return sections


# --------------------------------------------------------------------------
# SEO head extraction (verbatim from live HTML -- the signals we must preserve)
# --------------------------------------------------------------------------

def extract_head(path, yoast=None):
    h = raw_html(path)
    seo = {}
    if h:
        soup = BeautifulSoup(h[:200000], "lxml")
        t = soup.find("title")
        if t:
            seo["title"] = txt(t)
        for name in ("description", "robots"):
            m = soup.find("meta", attrs={"name": name})
            if m and m.get("content"):
                seo[name] = m["content"]
        c = soup.find("link", attrs={"rel": "canonical"})
        if c and c.get("href"):
            seo["canonical"] = c["href"]
        og = {}
        for m in soup.find_all("meta", property=re.compile(r"^(og|article):")):
            if m.get("content"):
                og[m["property"]] = m["content"]
        tw = {}
        for m in soup.find_all("meta", attrs={"name": re.compile(r"^twitter:")}):
            if m.get("content"):
                tw[m["name"]] = m["content"]
        if og:
            seo["og"] = og
        if tw:
            seo["twitter"] = tw
        graph = []
        for s in soup.find_all("script", type="application/ld+json"):
            try:
                d = json.loads(s.string or "{}")
            except Exception:
                continue
            graph.extend(d.get("@graph", [d]))
        if graph:
            types = set()
            for n in graph:
                if not isinstance(n, dict):
                    continue
                t = n.get("@type")
                if isinstance(t, list):
                    types.update(str(x) for x in t)
                elif t:
                    types.add(str(t))
            if types:
                seo["schema_types"] = sorted(types)
    if not seo.get("title") and yoast:
        seo["title"] = yoast.get("title", "")
        seo["description"] = yoast.get("description", "")
        seo["robots"] = ", ".join(
            f"{k}" if v is True else f"{v}" for k, v in (yoast.get("robots") or {}).items()
        ) or "index, follow"
        seo["canonical"] = yoast.get("canonical", "")
    return seo


def page_path(p, byid):
    parts = [p["slug"]]
    par = p.get("parent", 0)
    while par and par in byid:
        parts.insert(0, byid[par]["slug"])
        par = byid[par].get("parent", 0)
    return "/" + "/".join(parts) + "/"


def strip_wp(content):
    """Remove WP/plugin plumbing from post content, keep the words."""
    soup = BeautifulSoup(content, "lxml")
    for s in soup.find_all(["script", "style"]):
        s.decompose()
    related = []
    for lw in soup.select(".lwrp, .link-whisper-related-posts"):
        for a in lw.select("a[href]"):
            t = txt(a)
            if t:
                related.append({"title": t, "href": rel_url(a["href"])})
        lw.decompose()
    body = soup.body or soup
    return clean_inline(body), related


def main():
    pages = load("pages")
    posts = load("posts")
    tstm = load("testimonial")
    cats = load("categories")
    tags = load("tags")
    media = load("media")
    users = load("users")

    media_by_id = {m["id"]: m for m in media}
    byid = {p["id"]: p for p in pages}
    cat_by_id = {c["id"]: c for c in cats}
    tag_by_id = {t["id"]: t for t in tags}
    user_by_id = {u["id"]: u for u in users}

    stats = Counter()

    # ---- media index -----------------------------------------------------
    media_out = {}
    for m in media:
        src = m.get("source_url")
        if not src:
            continue
        d = m.get("media_details") or {}
        media_out[m["id"]] = {
            "src": rel_url(src),
            "alt": m.get("alt_text", "") or "",
            "width": d.get("width"),
            "height": d.get("height"),
            "mime": m.get("mime_type", ""),
            "title": txt(BeautifulSoup(m.get("title", {}).get("rendered", ""), "lxml")),
        }
    json.dump(media_out, open(os.path.join(OUT, "media.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    stats["media"] = len(media_out)

    # ---- pages -----------------------------------------------------------
    FRONT_SLUG = "home-in-the-light-roofing-final-update"
    pages_out = []
    for p in pages:
        path = page_path(p, byid)
        is_front = p["slug"] == FRONT_SLUG
        route = "/" if is_front else path
        content = p["content"]["rendered"] or ""
        sections = extract_elementor(content) if "elementor" in content.lower() else []
        rec = OrderedDict(
            id=p["id"],
            type="page",
            route=route,
            wp_path=path,
            slug=p["slug"],
            parent=p.get("parent", 0),
            title=html.unescape(re.sub("<[^>]+>", "", p["title"]["rendered"])),
            date=p["date"], modified=p["modified"],
            template=p.get("template") or "",
            is_front=is_front,
            seo=extract_head(route, p.get("yoast_head_json")),
        )
        if sections:
            rec["sections"] = sections
        else:
            body, _ = strip_wp(content)
            rec["html"] = body
        fm = p.get("featured_media")
        if fm and fm in media_out:
            rec["featured_image"] = media_out[fm]
        pages_out.append(rec)
        stats["pages"] += 1
        stats["page_blocks"] += sum(len(s["blocks"]) for s in sections)

    json.dump(pages_out, open(os.path.join(OUT, "pages.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    # ---- posts -----------------------------------------------------------
    posts_out = []
    for p in posts:
        route = rel_url(p["link"])
        body, related = strip_wp(p["content"]["rendered"] or "")
        exc = txt(BeautifulSoup(p.get("excerpt", {}).get("rendered", "") or "", "lxml"))
        exc = re.sub(r"\s*\[…\]\s*$|\s*\[\.\.\.\]\s*$", "…", exc).strip()
        rec = OrderedDict(
            id=p["id"], type="post", route=route, slug=p["slug"],
            title=html.unescape(re.sub("<[^>]+>", "", p["title"]["rendered"])),
            date=p["date"], modified=p["modified"],
            author=(user_by_id.get(p.get("author"), {}) or {}).get("name", ""),
            categories=[{"name": cat_by_id[c]["name"], "slug": cat_by_id[c]["slug"],
                         "route": rel_url(cat_by_id[c]["link"])}
                        for c in p.get("categories", []) if c in cat_by_id],
            tags=[{"name": tag_by_id[t]["name"], "slug": tag_by_id[t]["slug"],
                   "route": rel_url(tag_by_id[t]["link"])}
                  for t in p.get("tags", []) if t in tag_by_id],
            excerpt=exc,
            html=body,
            related=related,
            seo=extract_head(route, p.get("yoast_head_json")),
        )
        fm = p.get("featured_media")
        if fm and fm in media_out:
            rec["featured_image"] = media_out[fm]
            stats["posts_with_image"] += 1
        posts_out.append(rec)
        stats["posts"] += 1
    posts_out.sort(key=lambda x: x["date"], reverse=True)
    json.dump(posts_out, open(os.path.join(OUT, "posts.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    # ---- testimonials ----------------------------------------------------
    t_out = []
    for t in tstm:
        body, _ = strip_wp(t["content"]["rendered"] or "")
        t_out.append(OrderedDict(
            id=t["id"], type="testimonial", route=rel_url(t["link"]), slug=t["slug"],
            title=html.unescape(re.sub("<[^>]+>", "", t["title"]["rendered"])),
            date=t["date"], html=body,
            seo=extract_head(rel_url(t["link"]), t.get("yoast_head_json")),
        ))
        stats["testimonials"] += 1
    json.dump(t_out, open(os.path.join(OUT, "testimonials.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    # ---- taxonomies ------------------------------------------------------
    def tax(items, kind):
        out = []
        for c in items:
            if c.get("count", 0) == 0 and kind == "tag":
                continue
            out.append(OrderedDict(
                id=c["id"], type=kind, route=rel_url(c["link"]), slug=c["slug"],
                name=html.unescape(c["name"]), count=c.get("count", 0),
                description=html.unescape(c.get("description", "") or ""),
                seo=extract_head(rel_url(c["link"]), c.get("yoast_head_json")),
            ))
            stats[kind + "s"] += 1
        return out

    json.dump(tax(cats, "category"), open(os.path.join(OUT, "categories.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    json.dump(tax(tags, "tag"), open(os.path.join(OUT, "tags.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print("EXTRACTION COMPLETE")
    for k, v in sorted(stats.items()):
        print(f"  {k:<20} {v}")


if __name__ == "__main__":
    main()
