import re,os,html
root="mirror"
tot_raw=tot_body=0
files=[]
for dp,dn,fn in os.walk(root):
    if "index.html" in fn:
        p=os.path.join(dp,"index.html")
        raw=open(p,encoding='utf-8',errors='replace').read()
        n_raw=len(re.findall(r'(?i)<table',raw))
        body=re.sub(r'(?is)<(script|style)\b.*?</\1>',' ',raw)
        body=re.sub(r'(?is)<!--.*?-->',' ',body)
        n_body=len(re.findall(r'(?i)<table',body))
        tot_raw+=n_raw; tot_body+=n_body
        if n_raw or n_body: files.append((p,n_raw,n_body))
print("raw <table total:",tot_raw," after removing script/style/comments:",tot_body)
for p,a,b in files: print("  %s raw=%d body=%d"%(p,a,b))
# dump first table of one file
p=os.path.join(root,"steps-in-the-roof-replacement-process","index.html")
raw=open(p,encoding='utf-8',errors='replace').read()
m=re.search(r'(?is)<table.*?</table>',raw)
t=m.group(0)
print("\n--- sample table (steps-in-the-roof-replacement-process) ---")
print(("first 700 chars:\n"+t[:700]).encode("ascii","replace").decode())
print("th in sample:",len(re.findall(r'(?i)<th[ >]',t)),"td:",len(re.findall(r'(?i)<td[ >]',t)),"tr:",len(re.findall(r'(?i)<tr[ >]',t)))
