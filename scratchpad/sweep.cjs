const path=require('path');
const posts=require(path.join(__dirname,'..','content','posts.json'));
const SW=new Set(`a an the and or but for to of in on at by with from your you yours our we us is are was were be been being it its this that these those how what when where why which who whom will can do does did should would could as if not no more most than then there here into over under about after before during best top tips essential guide guides ultimate complete need needs know must one two three four five six seven eight nine ten eleven twelve 1 2 3 4 5 6 7 8 9 10 11 12 15 20`.split(/\s+/));
const P=posts.map(p=>({route:p.route,title:p.title,w:new Set(p.title.toLowerCase().replace(/[^a-z0-9\s-]/g,' ').split(/[\s-]+/).filter(w=>w&&!SW.has(w)))}));
function run(TH){
  const par=P.map((_,i)=>i);const f=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x];}return x;};
  let pairs=0;
  for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){
    const a=P[i].w,b=P[j].w;let n=0;for(const x of a)if(b.has(x))n++;
    if(n/(a.size+b.size-n)>=TH){pairs++;const ra=f(i),rb=f(j);if(ra!==rb)par[rb]=ra;}
  }
  const g={};P.forEach((p,i)=>{const r=f(i);(g[r]=g[r]||[]).push(p);});
  const cl=Object.values(g).filter(c=>c.length>=2).sort((a,b)=>b.length-a.length);
  const inside=cl.reduce((s,c)=>s+c.length,0);
  return {TH,pairs,clusters:cl.length,inside,pct:Math.round(inside/192*100),surv:192-inside+cl.length,sizes:cl.map(c=>c.length),cl};
}
for(let t=0.50;t>=0.38;t-=0.01){
  const r=run(+t.toFixed(2));
  console.log(`th=${r.TH} pairs=${String(r.pairs).padStart(3)} clusters=${String(r.clusters).padStart(2)} inside=${String(r.inside).padStart(3)} ${String(r.pct).padStart(2)}% surv=${String(r.surv).padStart(3)} largest=${r.sizes[0]} sizes=[${r.sizes.slice(0,6).join(',')}]`);
}
