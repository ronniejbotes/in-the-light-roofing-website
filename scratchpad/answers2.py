import re,os,html
root="mirror"
money=set()
for base in ("services","service-area"):
    for d in os.listdir(os.path.join(root,base)):
        p=os.path.join(root,base,d,"index.html")
        if os.path.isfile(p): money.add(os.path.normpath(p))
for d in ("index.html","home/index.html","home-in-the-light-roofing-new-design/index.html","about-us/index.html","contact/index.html"):
    money.add(os.path.normpath(os.path.join(root,d)))
def txt(p):
    s=open(p,encoding='utf-8',errors='replace').read()
    s=re.sub(r'(?is)<(script|style|noscript|svg)\b.*?</\1>',' ',s)
    s=re.sub(r'(?s)<[^>]+>',' ',s)
    return re.sub(r'\s+',' ',html.unescape(s))
price=re.compile(r'\$\s?[\d,]{3,}')
dur=re.compile(r'(?i)\b(?:takes?|complete[d]? (?:in|within)|typically|usually)\b[^.]{0,60}?\b\d+\s*(?:to|-|–)?\s*\d*\s*(?:day|days|week|weeks|hour|hours)\b')
mp=md=bp=bd=0
mhits=[];bhits=[]
for dp,dn,fn in os.walk(root):
    if "index.html" not in fn: continue
    p=os.path.normpath(os.path.join(dp,"index.html"))
    t=txt(p)
    pr=price.findall(t); du=dur.findall(t) or dur.search(t)
    dus=dur.findall(t)
    if p in money:
        if pr: mp+=1; mhits.append((p,"PRICE",pr[:3]))
        if dus: md+=1; mhits.append((p,"DUR",dus[:2]))
    else:
        if pr: bp+=1; bhits.append((p,"PRICE",pr[:3]))
        if dus: bd+=1; bhits.append((p,"DUR",dus[:2]))
print("money pages examined:",len(money))
print("money pages with a $ figure:",mp,"  with a duration statement:",md)
print("non-money pages with a $ figure:",bp,"  with a duration statement:",bd)
print("\n-- money page hits --")
for h in mhits[:20]: print(("   %s %s %s"%h).encode("ascii","replace").decode())
print("\n-- sample non-money hits --")
for h in bhits[:12]: print(("   %s %s %s"%h).encode("ascii","replace").decode())
