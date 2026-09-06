const fs=require('fs');
const per=JSON.parse(fs.readFileSync('scratchpad/perpost.json','utf8'));
const SITE=/^https?:\/\/(www\.)?inthelightroofing\.com/i;
// how many absolute-internal links exist at all?
let abs=0; per.forEach(p=>p.hrefs.forEach(v=>{if(SITE.test(v))abs++;}));
console.log('absolute inthelightroofing.com hrefs:',abs);
// naive "starts with http = external"
const naive=v=>/^https?:\/\//i.test(v);
const onlyExtNaive=per.filter(p=>p.hrefs.length>0 && p.hrefs.every(naive));
console.log('posts whose only links are http(s) [strict]:',onlyExtNaive.length);
// treating anchors/mailto/tel as "not counted"
const isExt=v=>/^https?:\/\//i.test(v)&&!SITE.test(v);
const ignorable=v=>/^(#|mailto:)/i.test(v);
const onlyExtLoose=per.filter(p=>{
  const real=p.hrefs.filter(v=>!ignorable(v));
  return real.length>0 && real.every(isExt);
});
console.log('posts whose only non-anchor/mailto links are external:',onlyExtLoose.length);
// posts with no internal-money and no other-internal, i.e. external-only OR zero
const noInternal=per.filter(p=>!p.hrefs.some(v=>!isExt(v)));
console.log('posts with NO internal link at all (incl. zero-link posts):',noInternal.length);
// list the classes present in posts that are ext-only under loose but not strict
const strictSet=new Set(onlyExtNaive.map(p=>p.route));
onlyExtLoose.filter(p=>!strictSet.has(p.route)).forEach(p=>console.log('  loose-only:',p.route,JSON.stringify(p.hrefs)));
// union of contact+tel posts
const ct=per.filter(p=>p.hrefs.some(v=>/^tel:/i.test(v)||/^\/contact\/?$/.test(v.replace(SITE,''))));
console.log('posts linking /contact/ or tel:',ct.length, ct.map(p=>p.route).join(' | '));
