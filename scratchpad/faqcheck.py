import re,os,html
root="mirror"
pages=[]
for base in ("services","service-area"):
    for d in sorted(os.listdir(os.path.join(root,base))):
        p=os.path.join(root,base,d,"index.html")
        if os.path.isfile(p): pages.append(("/%s/%s/"%(base,d),p))
for u,d in [("/","index.html"),("/home/","home/index.html"),("/about-us/","about-us/index.html"),("/contact/","contact/index.html")]:
    pages.append((u,os.path.join(root,d)))
def strip(s):
    s=re.sub(r'(?is)<(style|noscript|svg)\b.*?</\1>',' ',s); return s
def txt(s):
    s=re.sub(r'(?s)<[^>]+>',' ',s); return re.sub(r'\s+',' ',html.unescape(s)).strip()
for u,p in pages:
    raw=open(p,encoding='utf-8',errors='replace').read()
    faqschema = 'FAQPage' in raw
    body=re.sub(r'(?is)<script\b.*?</script>',' ',strip(raw))
    hs=[txt(m.group(2)) for m in re.finditer(r'(?is)<h([23456])[^>]*>(.*?)</h\1>',body)]
    q=[h for h in hs if h.endswith('?') or re.match(r'(?i)^(how|what|why|when|where|who|do |does |can |is |are |should )',h)]
    print("%-52s FAQschema=%-5s heads=%-3d questionheads=%d" % (u,faqschema,len(hs),len(q)))
    for h in q[:4]: print(("      Q: %s"%h[:110]).encode("ascii","replace").decode())
