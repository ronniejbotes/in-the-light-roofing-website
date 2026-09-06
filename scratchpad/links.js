const fs=require('fs');
const arr=JSON.parse(fs.readFileSync('content/posts.json','utf8'));
// strip script/style just in case
const strip=h=>h.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'');
// href with double, single or unquoted values
const RE=/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/gi;
let total=0;
const perPost=[];
const targetCount={};
for(const p of arr){
  const h=strip(p.html||'');
  let m,hrefs=[];
  RE.lastIndex=0;
  while((m=RE.exec(h))){ const v=(m[1]??m[2]??m[3]??'').trim(); hrefs.push(v); }
  total+=hrefs.length;
  hrefs.forEach(v=>targetCount[v]=(targetCount[v]||0)+1);
  perPost.push({route:p.route,title:p.title,hrefs});
}
console.log('posts',arr.length);
console.log('TOTAL in-body <a href> instances',total);

// classify
const SITE=/^https?:\/\/(www\.)?inthelightroofing\.com/i;
const norm=v=>v.replace(SITE,'');
const cls=v=>{
  const s=norm(v);
  if(/^tel:/i.test(s)) return 'tel';
  if(/^mailto:/i.test(s)) return 'mailto';
  if(/^#/.test(s)) return 'anchor';
  if(/^https?:\/\//i.test(s)) return 'external';
  if(/^\/services\//.test(s)) return 'services';
  if(/^\/service-area\//.test(s)) return 'service-area';
  if(/^\/contact\/?/.test(s)) return 'contact';
  if(/^\//.test(s)) return 'other-internal';
  return 'other('+s.slice(0,40)+')';
};
const inst={};
const postsWith={};
for(const p of perPost){
  const seen=new Set();
  for(const v of p.hrefs){ const c=cls(v); inst[c]=(inst[c]||0)+1; seen.add(c); }
  for(const c of seen) postsWith[c]=(postsWith[c]||0)+1;
}
console.log('\nLINK INSTANCES BY CLASS');
Object.entries(inst).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log('  ',k,v));
console.log('\nPOSTS WITH >=1 OF CLASS');
Object.entries(postsWith).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log('  ',k,v));

const zero=perPost.filter(p=>p.hrefs.length===0);
console.log('\nposts with ZERO body links',zero.length, zero.map(p=>p.route).join(' | '));
const onlyExt=perPost.filter(p=>p.hrefs.length>0 && p.hrefs.every(v=>cls(v)==='external'));
console.log('posts whose ONLY body links are external',onlyExt.length);
const money=perPost.filter(p=>p.hrefs.some(v=>['services','service-area','contact','tel'].includes(cls(v))));
console.log('posts linking >=1 money page (services/service-area/contact/tel)',money.length);
const maps=perPost.filter(p=>p.hrefs.some(v=>/maps\.app\.goo\.gl|google\.[a-z.]+\/maps|goo\.gl\/maps/i.test(v)));
console.log('posts linking to Google Maps offsite',maps.length);

console.log('\nTOP 15 TARGETS');
Object.entries(targetCount).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,v])=>console.log('  ',v,k));
fs.writeFileSync('scratchpad/perpost.json',JSON.stringify(perPost,null,1));
