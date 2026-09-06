const fs=require('fs');
const per=JSON.parse(fs.readFileSync('scratchpad/perpost.json','utf8'));
const isExt=v=>/^https?:\/\//i.test(v);
const buckets={};
per.forEach(p=>{
  const nExt=p.hrefs.filter(isExt).length, nInt=p.hrefs.length-nExt;
  const k=(nInt===0?'noInternal':'hasInternal')+'/'+(nExt===0?'noExternal':'hasExternal');
  (buckets[k]=buckets[k]||[]).push(p.route+' ['+nInt+'i/'+nExt+'e]');
});
Object.entries(buckets).forEach(([k,v])=>console.log(k, v.length));
console.log('\nposts with exactly 1 internal link and >=1 external:');
per.filter(p=>{const e=p.hrefs.filter(isExt).length;return p.hrefs.length-e===1&&e>0;}).slice(0,12).forEach(p=>console.log('  ',p.route,JSON.stringify(p.hrefs.filter(v=>!isExt(v)))));
console.log('\nsample other-internal targets:');
const oi={};
per.forEach(p=>p.hrefs.filter(v=>!isExt(v)&&!/^\/services\//.test(v)&&!/^\/service-area\//.test(v)&&!/^\/contact/.test(v)&&!/^tel:/.test(v)).forEach(v=>oi[v]=(oi[v]||0)+1));
Object.entries(oi).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log('  ',v,k));
