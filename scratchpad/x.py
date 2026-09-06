import re,sys
p=sys.argv[1]; n=int(sys.argv[2]) if len(sys.argv)>2 else 6000
h=open(p,encoding='utf-8',errors='replace').read()
m=re.search(r'<body.*',h,re.S); b=m.group(0) if m else h
b=re.sub(r'<script.*?</script>','',b,flags=re.S)
b=re.sub(r'<style.*?</style>','',b,flags=re.S)
t=re.sub(r'<[^>]+>','\n',b)
t=re.sub(r'\n\s*\n+','\n',t)
out=t.strip()[:n]
sys.stdout.buffer.write(out.encode('utf-8','replace'))
