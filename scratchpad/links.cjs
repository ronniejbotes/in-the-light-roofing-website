const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','mirror');
const files=[];
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
 if(e.isDirectory())walk(p);else if(/\.html?$/i.test(e.name))files.push(p);}})(root);
const inbound={};
for(const f of files){
  let h=fs.readFileSync(f,'utf8');
  h=h.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ');
  // strip header/footer/nav so we count body/contextual links too - but report both
  const seen=new Set();
  const re=/<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;let m;
  while((m=re.exec(h))){
    let u=(m[1]||m[2]||'').trim();
    u=u.replace(/^https?:\/\/(www\.)?inthelightroofing\.com/i,'');
    if(!u.startsWith('/'))continue;
    u=u.split('#')[0].split('?')[0];
    if(!u.endsWith('/'))u+='/';
    seen.add(u);
  }
  for(const u of seen)inbound[u]=(inbound[u]||0)+1;
}
const targets=['/services/insurance-claim-facilitation/','/services/storm-damage-repair/','/services/roof-replacement/','/services/roof-repairs/','/services/','/services/roof-inspections/','/services/new-roof-installation/'];
console.log('HTML files scanned:',files.length);
console.log('\nInbound internal links (unique linking pages) to SERVICE pages:');
targets.forEach(t=>console.log('  ',String(inbound[t]||0).padStart(4),t));
const posts=require(path.join(__dirname,'..','content','posts.json'));
const vals=posts.map(p=>({r:p.route,n:inbound[p.route]||0})).sort((a,b)=>b.n-a.n);
console.log('\nTop 12 blog posts by inbound internal links:');
vals.slice(0,12).forEach(v=>console.log('  ',String(v.n).padStart(4),v.r));
const stats=vals.map(v=>v.n);
console.log('\nblog post inbound: max',Math.max(...stats),'median',stats.sort((a,b)=>a-b)[96],'min',Math.min(...stats));
const clusters={
 'insurance (4 reproduced)':['/costly-roof-insurance-filing-mistakes/','/roof-insurance-claim-mistakes-to-avoid/','/roof-insurance-claim-denial-reasons/','/how-to-avoid-roof-insurance-claim-mistakes/'],
 'storm (9 reproduced)':['/storm-damage-repair-in-allentown/','/summer-roof-damage-prevention-strategies/','/steps-after-storm-roof-damage/','/signs-to-identify-storm-damage-on-the-roof/','/emergency-roof-repair-storm-allentown/','/storm-damage-roof-repair-steps-allentown/','/summer-storm-roof-damage-prevention-repair/','/how-to-identify-and-repair-storm-damage-to-your-roof/','/5-steps-to-take-to-repair-your-roof-after-a-storm/'],
};
console.log('\nCluster inbound detail:');
for(const [n,rs] of Object.entries(clusters)){
  console.log(' ',n);let sum=0;rs.forEach(r=>{const v=inbound[r]||0;sum+=v;console.log('    ',String(v).padStart(4),r);});
  console.log('     SUM =',sum);
}
