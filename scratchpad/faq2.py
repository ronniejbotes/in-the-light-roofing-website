import re,os,html
root="mirror"
def clean(p):
    s=open(p,encoding='utf-8',errors='replace').read()
    return re.sub(r'(?is)<(script|style|noscript|svg)\b.*?</\1>',' ',s)
def txt(s):
    s=re.sub(r'(?s)<[^>]+>',' ',s); return re.sub(r'\s+',' ',html.unescape(s)).strip()
for slug in ["how-much-does-a-new-roof-cost-in-pennsylvania","factors-to-consider-before-roof-replacement","amazing-new-roof-installation-planning-tips"]:
    p=os.path.join(root,slug,"index.html")
    if not os.path.isfile(p): print("MISSING",slug); continue
    b=clean(p)
    h1=re.search(r'(?is)<h1[^>]*>(.*?)</h1>',b)
    print("\n=== /%s/"%slug)
    print(("H1: "+txt(h1.group(1) if h1 else "")).encode("ascii","replace").decode())
    rest=b[h1.end():] if h1 else b
    ps=[txt(x) for x in re.findall(r'(?is)<p[^>]*>(.*?)</p>',rest) if len(txt(x))>40][:2]
    for i,x in enumerate(ps): print(("P%d: %s"%(i+1,x[:300])).encode("ascii","replace").decode())
    qs=[txt(m.group(2)) for m in re.finditer(r'(?is)<h([23456])[^>]*>(.*?)</h\1>',rest)]
    qq=[h for h in qs if h.rstrip().endswith('?')]
    print("question headings:",len(qq))
    for h in qq[:6]: print(("   Q: "+h[:110]).encode("ascii","replace").decode())
    print("FAQPage schema in raw:", 'FAQPage' in open(p,encoding='utf-8',errors='replace').read())
