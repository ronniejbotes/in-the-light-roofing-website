const posts = require(require('path').join(__dirname,'..','content','posts.json'));
const SW = new Set(`a an the and or but for to of in on at by with from your you yours our we us is are was were be been being it its this that these those how what when where why which who whom will can do does did should would could as if not no more most than then there here into over under about after before during
best top tips essential guide guides ultimate complete need needs know must
one two three four five six seven eight nine ten eleven twelve
1 2 3 4 5 6 7 8 9 10 11 12 15 20`.split(/\s+/).filter(Boolean));

function words(t){
  return new Set(
    t.toLowerCase()
     .replace(/[^a-z0-9\s-]/g,' ')
     .split(/[\s-]+/)
     .filter(w=>w && !SW.has(w))
  );
}
const P = posts.map(p=>({route:p.route,title:p.title,w:words(p.title)}));
function jac(a,b){let i=0;for(const x of a) if(b.has(x)) i++; return i/(a.size+b.size-i);}

const TH = parseFloat(process.env.TH||'0.50');
const parent=P.map((_,i)=>i);
function find(x){while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;}
function uni(a,b){a=find(a);b=find(b);if(a!==b)parent[b]=a;}
let pairs=0; const pairList=[];
for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){
  const s=jac(P[i].w,P[j].w);
  if(s>=TH){pairs++;pairList.push([s.toFixed(3),P[i].title,P[j].title]);uni(i,j);}
}
const g={};
P.forEach((p,i)=>{const r=find(i);(g[r]=g[r]||[]).push(p);});
const cl=Object.values(g).filter(c=>c.length>=2).sort((a,b)=>b.length-a.length);
const inside=cl.reduce((s,c)=>s+c.length,0);
console.log('threshold:',TH);
console.log('near-duplicate pairs:',pairs);
console.log('clusters of 2+ posts:',cl.length);
console.log('posts inside such a cluster:',inside,'of',P.length,'=',Math.round(inside/P.length*100)+'%');
console.log('surviving pages if each cluster collapses to one:',P.length-inside+cl.length);
console.log('cluster sizes:',cl.map(c=>c.length).join(','));
console.log('\n--- clusters ---');
cl.forEach((c,i)=>{console.log(`\nCluster ${i+1} (${c.length}):`);c.forEach(p=>console.log('   ',p.route,'|',p.title));});
