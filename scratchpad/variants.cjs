const path=require('path');
const posts=require(path.join(__dirname,'..','content','posts.json'));
const NUM='one two three four five six seven eight nine ten eleven twelve 1 2 3 4 5 6 7 8 9 10 11 12 15 20'.split(' ');
const NAMED='best top tips essential'.split(' ');
const ARTICLES='a an the and or but for to of in on at by with from your you yours our we us is are was were be been being it its this that these those'.split(' ');
const QWORDS='how what when where why which who whom will can do does did should would could'.split(' ');
const FILLER='guide guides ultimate complete need needs know must amazing smart clear alarming trusted'.split(' ');
const variants={
  'minimal (named stopwords only)':[...NUM,...NAMED],
  'named + articles':[...NUM,...NAMED,...ARTICLES],
  'named + articles + qwords (my run)':[...NUM,...NAMED,...ARTICLES,...QWORDS,'guide','guides','ultimate','complete','need','needs','know','must','more','most','than','then','there','here','into','over','under','about','after','before','during','if','not','no','as'],
  'aggressive (+filler)':[...NUM,...NAMED,...ARTICLES,...QWORDS,...FILLER],
  'aggressive + drop roof/roofing':[...NUM,...NAMED,...ARTICLES,...QWORDS,...FILLER,'roof','roofing','roofs'],
  'aggressive + drop geo':[...NUM,...NAMED,...ARTICLES,...QWORDS,...FILLER,'allentown','pa','lehigh','valley','bethlehem'],
};
function run(swList,TH){
  const SW=new Set(swList);
  const P=posts.map(p=>({route:p.route,title:p.title,w:new Set(p.title.toLowerCase().replace(/[^a-z0-9\s-]/g,' ').split(/[\s-]+/).filter(w=>w&&!SW.has(w)))}));
  const par=P.map((_,i)=>i);const f=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x];}return x;};
  let pairs=0;
  for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){
    const a=P[i].w,b=P[j].w;let inter=0;for(const x of a)if(b.has(x))inter++;
    const s=inter/(a.size+b.size-inter);
    if(s>=TH){pairs++;const ra=f(i),rb=f(j);if(ra!==rb)par[rb]=ra;}
  }
  const g={};P.forEach((p,i)=>{const r=f(i);(g[r]=g[r]||[]).push(p);});
  const cl=Object.values(g).filter(c=>c.length>=2).sort((a,b)=>b.length-a.length);
  const inside=cl.reduce((s,c)=>s+c.length,0);
  return {pairs,clusters:cl.length,inside,pct:Math.round(inside/192*100),surv:192-inside+cl.length,sizes:cl.map(c=>c.length)};
}
console.log('TARGET (claim): pairs=73 clusters=15 inside=72 pct=38 surv=135 largest=20 storm=12 repl=8 ins=6\n');
for(const [name,sw] of Object.entries(variants)){
  for(const th of [0.5]){
    const r=run(sw,th);
    console.log(`${name.padEnd(38)} th=${th} pairs=${String(r.pairs).padStart(3)} clusters=${String(r.clusters).padStart(2)} inside=${String(r.inside).padStart(3)} ${String(r.pct).padStart(2)}% surv=${r.surv} sizes=[${r.sizes.slice(0,8).join(',')}${r.sizes.length>8?',…':''}]`);
  }
}
