/**
 * Side-by-side page-weight and LCP comparison: the live WordPress site
 * against the local build, for the same URLs.
 */
import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC=join(process.env.USERPROFILE||'','AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const b=await chromium.launch({executablePath:EXEC})
async function measure(base,url,label){
  const ctx=await b.newContext({viewport:{width:1440,height:900}})
  const p=await ctx.newPage()
  let total=0,reqs=0,img=0,js=0,css=0,font=0,html=0
  p.on('response',async r=>{
    try{let n=Number(r.headers()['content-length']||0)
      if(!n){try{n=(await r.body()).length}catch{n=0}}
      const t=r.headers()['content-type']||''
      total+=n; reqs++
      if(/image/.test(t))img+=n; else if(/javascript/.test(t))js+=n
      else if(/css/.test(t))css+=n; else if(/font/.test(t))font+=n
      else if(/html/.test(t))html+=n
    }catch{}
  })
  const t0=Date.now()
  try{ await p.goto(base+url,{waitUntil:'load',timeout:90000}) }catch(e){ console.log(' nav:',e.message.slice(0,40)) }
  const lcp=await p.evaluate(()=>new Promise(res=>{
    let v=0
    try{new PerformanceObserver(l=>{for(const e of l.getEntries())v=e.startTime}).observe({type:'largest-contentful-paint',buffered:true})}catch{}
    setTimeout(()=>res(Math.round(v)),3000)
  })).catch(()=>0)
  await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)).catch(()=>{})
  await p.waitForTimeout(3500)
  const dom=await p.evaluate(()=>document.querySelectorAll('*').length).catch(()=>0)
  const kb=x=>(x/1024).toFixed(0)
  console.log(`${label.padEnd(14)} ${String(reqs).padStart(4)} ${kb(total).padStart(7)}KB  html:${kb(html).padStart(5)} img:${kb(img).padStart(6)} js:${kb(js).padStart(6)} css:${kb(css).padStart(5)} font:${kb(font).padStart(4)}  LCP:${String(lcp).padStart(5)}ms  DOM:${String(dom).padStart(5)}`)
  await ctx.close()
  return {reqs,total,lcp,dom}
}
console.log('target'.padEnd(14),'reqs','  total','  breakdown')
for(const [base,url,label] of [
  ['https://inthelightroofing.com','/','LIVE home'],
  ['http://127.0.0.1:4321','/','NEW home'],
  ['https://inthelightroofing.com','/services/roof-repairs/','LIVE service'],
  ['http://127.0.0.1:4321','/services/roof-repairs/','NEW service'],
  ['https://inthelightroofing.com','/storm-damage-roof-checklist-lehigh-valley/','LIVE post'],
  ['http://127.0.0.1:4321','/storm-damage-roof-checklist-lehigh-valley/','NEW post'],
]) await measure(base,url,label)
await b.close()
