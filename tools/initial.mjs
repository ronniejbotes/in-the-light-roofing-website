/**
 * Initial page load with NO user interaction, so the deferred third-party
 * tags have not fired yet. This is what a visitor who lands and reads gets.
 */
import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC=join(process.env.USERPROFILE||'','AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const b=await chromium.launch({executablePath:EXEC})
console.log('Initial page load, NO user interaction (deferred tags not yet fired):')
console.log('target'.padEnd(16),'reqs'.padStart(5),'total'.padStart(9),'LCP'.padStart(8))
for(const [base,url,label] of [
  ['https://inthelightroofing.com','/','LIVE home'],
  ['http://127.0.0.1:4321','/','NEW home'],
  ['https://inthelightroofing.com','/services/roof-repairs/','LIVE service'],
  ['http://127.0.0.1:4321','/services/roof-repairs/','NEW service'],
]){
  const ctx=await b.newContext({viewport:{width:1440,height:900}})
  const p=await ctx.newPage()
  let total=0,reqs=0
  p.on('response',async r=>{try{let n=Number(r.headers()['content-length']||0)
    if(!n){try{n=(await r.body()).length}catch{n=0}};total+=n;reqs++}catch{}})
  try{await p.goto(base+url,{waitUntil:'load',timeout:90000})}catch{}
  const lcp=await p.evaluate(()=>new Promise(res=>{let v=0
    try{new PerformanceObserver(l=>{for(const e of l.getEntries())v=e.startTime}).observe({type:'largest-contentful-paint',buffered:true})}catch{}
    setTimeout(()=>res(Math.round(v)),2500)})).catch(()=>0)
  console.log(label.padEnd(16),String(reqs).padStart(5),((total/1024).toFixed(0)+'KB').padStart(9),(lcp+'ms').padStart(8))
  await ctx.close()
}
await b.close()
