const path=require('path');
const posts=require(path.join(__dirname,'..','content','posts.json'));
function grams(html){
  const t=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&[a-z]+;|&#\d+;/gi,' ')
    .toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
  const g=new Set();
  for(let i=0;i+5<=t.length;i++)g.add(t.slice(i,i+5).join(' '));
  return g;
}
const P=posts.map(p=>({route:p.route,author:p.author,g:grams(p.html||'')}));
console.log('posts with empty body:',P.filter(p=>p.g.size===0).length);
const res=[];
for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){
  const a=P[i].g,b=P[j].g;if(!a.size||!b.size)continue;
  let n=0;const [s,l]=a.size<b.size?[a,b]:[b,a];for(const x of s)if(l.has(x))n++;
  const jac=n/(a.size+b.size-n);
  if(jac>=0.05)res.push({jac,a:P[i],b:P[j]});
}
res.sort((x,y)=>y.jac-x.jac);
console.log('pairs with 5-gram Jaccard >= 15%:',res.filter(r=>r.jac>=0.15).length);
console.log('pairs >= 10%:',res.filter(r=>r.jac>=0.10).length);
console.log('pairs >=  5%:',res.length);
console.log('\ntop 12 body pairs:');
res.slice(0,12).forEach(r=>console.log('  ',(r.jac*100).toFixed(1)+'%',`[${r.a.author}/${r.b.author}]`,r.a.route,'<>',r.b.route));
