const fs=require('fs');
const posts=JSON.parse(fs.readFileSync('content/posts.json','utf8'));
const per=JSON.parse(fs.readFileSync('scratchpad/perpost.json','utf8'));
const byRoute={}; per.forEach(p=>byRoute[p.route]=p.hrefs);
const TOWNS=[
 {name:'Allentown',re:/\ballentown\b/i,page:'/service-area/allentown/'},
 {name:'Bethlehem',re:/\bbethlehem\b/i,page:'/service-area/roofers-bethlehem-pa/'},
 {name:'Center Valley',re:/\bcenter\s+valley\b/i,page:'/service-area/center-valley-roofing-contractor/'},
 {name:'Easton',re:/\beaston\b/i,page:'/service-area/easton/'},
 {name:'Whitehall',re:/\bwhitehall\b/i,page:'/service-area/whitehall/'},
 {name:'Macungie',re:/\bmacungie\b/i,page:'/service-area/macungie/'},
 {name:'Catasauqua',re:/\bcatasauqua\b/i,page:'/service-area/catasauqua/'},
 {name:'Coplay',re:/\bcoplay\b/i,page:'/service-area/coplay/'},
 {name:'Northampton',re:/\bnorthampton\b/i,page:'/service-area/northampton/'},
 {name:'Slatington',re:/\bslatington\b/i,page:'/service-area/slatington/'},
 {name:'Walnutport',re:/\bwalnutport\b/i,page:'/service-area/walnutport/'},
 {name:'Lehigh Valley',re:/\blehigh\s+valley\b/i,page:'/service-area/lehigh-valley/'},
];
let withTown=0, withTownExclLV=0, matchLink=0, anyServiceAreaLink=0;
const hits=[];
for(const p of posts){
  const t=p.title||'';
  const ms=TOWNS.filter(T=>T.re.test(t));
  if(!ms.length) continue;
  withTown++;
  if(ms.some(m=>m.name!=='Lehigh Valley')) withTownExclLV++;
  const hrefs=byRoute[p.route]||[];
  const sa=hrefs.filter(h=>/^\/service-area\//.test(h));
  if(sa.length) anyServiceAreaLink++;
  const matched=ms.filter(m=>sa.some(h=>h.replace(/\/$/,'')===m.page.replace(/\/$/,'')));
  if(matched.length){ matchLink++; hits.push([p.route,ms.map(m=>m.name).join('+'),JSON.stringify(sa)]); }
}
console.log('posts whose TITLE names a claimed town or "Lehigh Valley":',withTown);
console.log('  ... excluding Lehigh-Valley-only titles:',withTownExclLV);
console.log('of those, posts linking to ANY /service-area/ page:',anyServiceAreaLink);
console.log('of those, posts linking to THEIR OWN town page:',matchLink);
hits.forEach(h=>console.log('   ',h.join('  ')));
// per-town title counts
console.log('\ntitle mentions by town:');
TOWNS.forEach(T=>{
  const n=posts.filter(p=>T.re.test(p.title||'')).length;
  const linked=posts.filter(p=>(byRoute[p.route]||[]).some(h=>h.replace(/\/$/,'')===T.page.replace(/\/$/,''))).length;
  console.log('  ',T.name.padEnd(14),'titles',String(n).padStart(3),' posts linking its page',linked);
});
// all service-area links anywhere in blog
const all={};
per.forEach(p=>p.hrefs.filter(h=>/^\/service-area\//.test(h)).forEach(h=>all[h]=(all[h]||0)+1));
console.log('\nALL /service-area/ links in blog bodies:',JSON.stringify(all,null,1));
per.filter(p=>p.hrefs.some(h=>/^\/service-area\//.test(h))).forEach(p=>console.log('  from',p.route,'->',p.hrefs.filter(h=>/^\/service-area\//.test(h)).join(',')));
