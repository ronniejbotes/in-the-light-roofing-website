import re,os,sys,html,json

root="mirror"
pages=[]
for d in sorted(os.listdir(os.path.join(root,"services"))):
    p=os.path.join(root,"services",d,"index.html")
    if os.path.isfile(p): pages.append(("/services/%s/"%d,p))
pages.append(("/services/",os.path.join(root,"services","index.html")))
for d in sorted(os.listdir(os.path.join(root,"service-area"))):
    p=os.path.join(root,"service-area",d,"index.html")
    if os.path.isfile(p): pages.append(("/service-area/%s/"%d,p))
pages.append(("/service-area/",os.path.join(root,"service-area","index.html")))
for u,d in [("/","index.html"),("/home/","home/index.html"),("/home-in-the-light-roofing-new-design/","home-in-the-light-roofing-new-design/index.html"),("/about-us/","about-us/index.html"),("/contact/","contact/index.html")]:
    p=os.path.join(root,d)
    if os.path.isfile(p): pages.append((u,p))

def strip(s):
    s=re.sub(r'(?is)<(script|style|noscript|svg)\b.*?</\1>',' ',s)
    s=re.sub(r'(?is)<!--.*?-->',' ',s)
    return s

def text(s):
    s=re.sub(r'(?s)<[^>]+>',' ',s)
    s=html.unescape(s)
    return re.sub(r'\s+',' ',s).strip()

out=[]
for url,path in pages:
    raw=open(path,encoding='utf-8',errors='replace').read()
    body=strip(raw)
    m=re.search(r'(?is)<h1[^>]*>(.*?)</h1>',body)
    h1=text(m.group(1)) if m else "(NO H1)"
    rest=body[m.end():] if m else body
    # first paragraphs after H1
    paras=[text(x) for x in re.findall(r'(?is)<p[^>]*>(.*?)</p>',rest)]
    paras=[p for p in paras if len(p)>40][:2]
    out.append({"url":url,"h1":h1,"open":" || ".join(paras)[:420]})

print(len(out),"pages")
for o in out:
    print("\n=== %s"%o["url"])
    print("H1: %s"%o["h1"])
    print("P : %s"%o["open"])
