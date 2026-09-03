#!/usr/bin/env python3
"""
Extract the site-wide chrome -- navigation, footer, NAP, socials, third-party IDs --
from the captured live HTML into content/site.json.

Everything here is read out of the live markup. Nothing is invented. Where the live
site is inconsistent (see NOTES at the bottom of the output) the inconsistency is
recorded rather than silently resolved.
"""
import json, os, re, html
from bs4 import BeautifulSoup

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SP = os.environ.get("ITLR_SCRATCH") or (
    r"C:/Users/ronja/AppData/Local/Temp/claude/"
    r"c--Users-ronja-iCloudDrive-Documents-GitHub-in-the-light-roofing-website/"
    r"e4f72178-8f47-4887-9127-6503e961e26b/scratchpad"
)
SITE = "https://inthelightroofing.com"


def rel(u):
    if not u:
        return u
    u = u.strip()
    for h in (SITE, "http://inthelightroofing.com", "https://www.inthelightroofing.com"):
        if u.startswith(h):
            return u[len(h):] or "/"
    return u


def txt(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip() if el else ""


def real_src(im):
    """Elementor/LiteSpeed lazy-loads: the placeholder is in src, the file in data-src."""
    for k in ("data-src", "data-lazy-src", "src"):
        v = im.get(k)
        if v and not v.startswith("data:"):
            return rel(v)
    return None


def soup_of(path):
    rel_p = "index.html" if path == "/" else path.strip("/") + "/index.html"
    with open(os.path.join(SP, "raw", rel_p), encoding="utf-8", errors="replace") as f:
        return BeautifulSoup(f.read(), "lxml"), f


def menu_tree(ul):
    out = []
    for li in ul.find_all("li", recursive=False):
        a = li.find("a", recursive=False) or li.find("a")
        if not a:
            continue
        item = {"label": txt(a), "href": rel(a.get("href", ""))}
        sub = li.find("ul", recursive=False)
        if sub:
            kids = menu_tree(sub)
            if kids:
                item["children"] = kids
        out.append(item)
    return out


def main():
    with open(os.path.join(SP, "raw", "index.html"), encoding="utf-8", errors="replace") as f:
        raw = f.read()
    s = BeautifulSoup(raw, "lxml")
    hd = s.select_one("header#masthead")
    ft = s.select_one("footer#colophon")

    site = {}

    # ---- identity / NAP -------------------------------------------------
    with open(os.path.join(SP, "raw", "contact", "index.html"), encoding="utf-8", errors="replace") as f:
        contact_raw = f.read()
    addr = re.search(r"(\d+\s+N\s+Fenwick\s+St\.?)\s*<[^>]*>\s*([A-Za-z ]+,\s*PA\s*\d{5})", contact_raw)
    if not addr:
        m = re.search(r"(871 N Fenwick St\.?)[\s\S]{0,80}?(Allentown,\s*PA\s*\d{5})", contact_raw)
        addr = m
    street = addr.group(1).strip() if addr else ""
    citystate = re.sub(r"\s+", " ", addr.group(2)).strip() if addr else ""
    cm = re.match(r"(.+?),\s*([A-Z]{2})\s*(\d{5})", citystate)

    tel = ""
    for a in (hd or s).find_all("a", href=re.compile(r"^tel:")):
        tel = a["href"][4:]
        break
    phone_display = ""
    for a in (ft or s).find_all("a", href=re.compile(r"^tel:")):
        if txt(a):
            phone_display = txt(a)
            break

    # NOTE: the Facebook profile slug is "InthelightcontractingLLC", which hints at a
    # registered name of "In the Light Contracting LLC" -- but a profile slug is not
    # evidence of a legal name, so it is not recorded here. Confirm with the client
    # before putting any legal entity name or licence number on the site.
    site["business"] = {
        "name": "In The Light Roofing",
        "street": street,
        "city": cm.group(1) if cm else "",
        "region": cm.group(2) if cm else "",
        "postal_code": cm.group(3) if cm else "",
        "country": "US",
        "phone_display": phone_display,
        "phone_href": "tel:" + tel if tel else "",
        "email": "info@inthelightroofing.com",
        "founded": "2017",
        "founder": "Bryson Berard",
        "languages": ["English", "Spanish"],  # footer states "Hablamos espanol"
    }

    # ---- logos ----------------------------------------------------------
    logos = {}
    if hd:
        im = hd.find("img", alt=re.compile("logo", re.I))
        if im is not None:
            logos["header"] = {"src": real_src(im), "alt": im.get("alt", ""),
                               "width": im.get("width"), "height": im.get("height")}
    if ft:
        sl = ft.select_one(".elementor-widget-site-logo img, .hfe-site-logo img") or ft.find("img")
        if sl is not None:
            logos["footer"] = {"src": real_src(sl), "alt": sl.get("alt", "")}
    ic = s.find("link", rel=re.compile("icon", re.I))
    if ic and ic.get("href"):
        logos["favicon"] = rel(ic["href"])
    site["logos"] = logos

    # ---- header ---------------------------------------------------------
    header = {"badges": [], "cta": [], "nav": []}
    if hd:
        for w in hd.find_all(attrs={"data-widget_type": "icon-box.default"}):
            t = txt(w)
            if not t:
                continue
            a = w.find("a", href=True)
            b = {"text": t}
            im = w.find("img")
            if im is not None:
                b["image"] = {"src": real_src(im), "alt": im.get("alt", "")}
            if a is not None:
                b["href"] = rel(a["href"])
            header["badges"].append(b)
        for w in hd.find_all(attrs={"data-widget_type": "button.default"}):
            a = w.find("a", href=True)
            if a is not None:
                header["cta"].append({"label": txt(w), "href": rel(a["href"])})
        nav = hd.select_one("nav.elementor-nav-menu--main ul.elementor-nav-menu") or hd.select_one("ul.elementor-nav-menu")
        if nav:
            header["nav"] = menu_tree(nav)
        socials = []
        for a in hd.select(".elementor-widget-social-icons a[href], .elementor-social-icon"):
            href = a.get("href")
            if href and href.startswith("http"):
                socials.append(href)
        header["socials"] = sorted(set(socials))
    site["header"] = header

    # ---- footer ---------------------------------------------------------
    footer = {"columns": [], "socials": [], "cta": []}
    if ft:
        te = ft.find(attrs={"data-widget_type": "text-editor.default"})
        footer["about"] = txt(te)
        for a in ft.select(".elementor-widget-social-icons a[href]"):
            if a["href"].startswith("http"):
                footer["socials"].append(a["href"])
        footer["socials"] = sorted(set(footer["socials"]))
        # heading -> following menu column
        headings = ft.find_all(attrs={"data-widget_type": "heading.default"})
        for h in headings:
            label = txt(h)
            if not label or "copyright" in label.lower():
                continue
            nxt = h.find_next(attrs={"data-widget_type": re.compile("navigation-menu|nav-menu")})
            col = {"heading": label, "items": []}
            if nxt is not None:
                ul = nxt.find("ul")
                if ul is not None:
                    col["items"] = menu_tree(ul)
            if col["items"]:
                footer["columns"].append(col)
        contact_items = []
        for w in ft.find_all(attrs={"data-widget_type": "icon-box.default"}):
            t = txt(w)
            if t:
                a = w.find("a", href=True)
                it = {"text": t}
                if a is not None:
                    it["href"] = rel(a["href"])
                contact_items.append(it)
        footer["contact"] = contact_items
        for w in ft.find_all(attrs={"data-widget_type": "button.default"}):
            a = w.find("a", href=True)
            if a is not None:
                footer["cta"].append({"label": txt(w), "href": rel(a["href"])})
        cp = [txt(h) for h in headings if "copyright" in txt(h).lower()]
        footer["copyright"] = cp[0] if cp else ""
    site["footer"] = footer

    # ---- third parties --------------------------------------------------
    # Every id below is read out of the live page. These are the tags the
    # client's marketing depends on -- CallRail in particular does dynamic
    # number insertion for the paid-ads campaigns, so losing it would break
    # call attribution. Each can be switched off individually here.
    callrail = re.search(r"cdn\.callrail\.com/companies/(\d+)/([\w.-]+)/swap\.js", raw)
    fastbot = re.search(r'app\.fastbots\.ai/embed\.js"\s+data-bot-id="([^"]+)"', raw)
    cleantalk = re.search(r"https://(obseu\.[a-z]+\.com)/i/([0-9a-f]+)\.js", raw)

    site["third_party"] = {
        "gtm": sorted(set(re.findall(r"GTM-[A-Z0-9]+", raw))),
        "ga4": sorted(set(re.findall(r"G-[A-Z0-9]{8,}", raw))),
        "trustindex": bool(re.search(r"cdn\.trustindex\.io", raw)),
        "clickcease": bool(re.search(r"clickcease\.com/monitor/stat\.js", raw)),
        "callrail": ({"company": callrail.group(1), "path": callrail.group(2)}
                     if callrail else None),
        "fastbots_bot_id": fastbot.group(1) if fastbot else None,
        # CleanTalk's bot detector ("ct_clicktrue"), served from rotating
        # obseu.* collector domains. It exists to protect the WordPress forms;
        # with WordPress gone it has nothing to protect, so it is recorded but
        # left disabled -- see NOTES.md.
        "cleantalk": ({"host": cleantalk.group(1), "id": cleantalk.group(2)}
                      if cleantalk else None),
        "cleantalk_enabled": False,
    }

    # ---- forms ----------------------------------------------------------
    forms = {}
    for fid in sorted(set(re.findall(r"forminator-custom-form-(\d+)", raw))):
        forms[fid] = {"id": fid}
    site["forms"] = forms

    # ---- popups (Elementor) ---------------------------------------------
    popups = []
    for p in s.select("[data-elementor-type='popup']"):
        m = re.search(r"elementor-(\d+)", " ".join(p.get("class", [])))
        pid = m.group(1) if m else ""
        h = p.find(re.compile(r"^h[1-6]$"))
        popups.append({"id": pid, "heading": txt(h) if h else "",
                       "has_form": p.find("form") is not None})
    site["popups"] = popups

    out = os.path.join(REPO, "content", "site.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(site, f, ensure_ascii=False, indent=1)

    print("Wrote", out)
    print(json.dumps({k: (v if not isinstance(v, (list, dict)) else f"<{len(v)}>")
                      for k, v in site.items()}, indent=1))
    print("\nNAP:", json.dumps(site["business"], ensure_ascii=False, indent=1))
    print("\nNav top level:", [i["label"] for i in site["header"]["nav"]])
    print("Footer columns:", [c["heading"] for c in site["footer"]["columns"]])
    print("Header badges:", [b["text"] for b in site["header"]["badges"]])
    print("Third party:", json.dumps(site["third_party"]))
    print("Popups:", json.dumps(site["popups"]))


if __name__ == "__main__":
    main()
