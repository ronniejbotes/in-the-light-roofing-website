import re,os,html
root="mirror"
money=set()
for base in ("services","service-area"):
    for d in os.listdir(os.path.join(root,base)):
        p=os.path.join(root,base,d,"index.html")
        if os.path.isfile(p): money.add(os.path.normpath(p))
for d in ("index.html","home/index.html","home-in-the-light-roofing-new-design/index.html","about-us/index.html","contact/index.html"):
    money.add(os.path.normpath(os.path.join(root,d)))
def txt(s):
    s=re.sub(r'(?s)<[^>]+>',' ',s); return re.sub(r'\s+',' ',html.unescape(s)).strip()
tot=0; withq=0; mq=0; faq=0; faqfiles=[]
for dp,dn,fn in os.walk(root):
    if "index.html" not in fn: continue
    p=os.path.normpath(os.path.join(dp,"index.html")); tot+=1
    raw=open(p,encoding='utf-8',errors='replace').read()
    if '"FAQPage"' in raw or 'FAQPage' in raw: faq+=1; faqfiles.append(p)
    b=re.sub(r'(?is)<(script|style|noscript|svg)\b.*?</\1>',' ',raw)
    qs=[txt(m.group(2)) for m in re.finditer(r'(?is)<h([23456])[^>]*>(.*?)</h\1>',b)]
    qq=[h for h in qs if h.rstrip().endswith('?')]
    if qq:
        withq+=1
        if p in money: mq+=1
print("total index.html:",tot)
print("pages with >=1 heading ending in '?':",withq)
print("  of which money pages:",mq,"(money set size %d)"%len(money))
print("pages containing FAQPage schema:",faq, faqfiles[:5])
