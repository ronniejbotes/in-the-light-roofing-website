const fs=require('fs');
const per=JSON.parse(fs.readFileSync('scratchpad/perpost.json','utf8'));
const routes=new Set(fs.readFileSync('routes.txt','utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean));
const svc={};
per.forEach(p=>p.hrefs.filter(h=>/^\/services\//.test(h)).forEach(h=>svc[h]=(svc[h]||0)+1));
console.log('SERVICE LINK TARGETS  (count | in routes.txt?)');
Object.entries(svc).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log('  ',String(v).padStart(3),k,routes.has(k)?'LIVE':'*** NOT IN routes.txt ***'));
// corrected money set: services + contact/tel only (exclude the 4 x 404 and the hub)
const money=per.filter(p=>p.hrefs.some(h=>/^\/services\//.test(h)||/^tel:/i.test(h)||/^\/contact\/?$/.test(h)));
console.log('\nposts linking services OR contact/tel:',money.length);
const svcOnly=per.filter(p=>p.hrefs.some(h=>/^\/services\//.test(h)));
console.log('posts linking >=1 /services/ page:',svcOnly.length);
// contact/tel posts that ALSO link a service page?
const ct=per.filter(p=>p.hrefs.some(h=>/^tel:/i.test(h)||/^\/contact\/?$/.test(h)));
console.log('contact/tel posts that also link a service page:',ct.filter(p=>p.hrefs.some(h=>/^\/services\//.test(h))).length,'of',ct.length);
// other-internal targets vs routes
const oi={};
per.forEach(p=>p.hrefs.filter(h=>/^\//.test(h)&&!/^\/services\//.test(h)&&!/^\/service-area\//.test(h)&&!/^\/contact/.test(h)).forEach(h=>oi[h]=(oi[h]||0)+1));
console.log('\nOTHER-INTERNAL targets not in routes.txt:');
Object.entries(oi).forEach(([k,v])=>{if(!routes.has(k))console.log('  ',v,k)});
