/**
 * List a single page's first-party assets by size, largest first. Useful for
 * finding the one file that dominates a page.
 */
import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC=join(process.env.USERPROFILE||'','AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const b=await chromium.launch({executablePath:EXEC})
const ctx=await b.newContext({viewport:{width:1440,height:900}})
const p=await ctx.newPage()
const rows=[]
p.on('response',async r=>{
  if(!r.url().includes('127.0.0.1'))return
  try{let n=Number(r.headers()['content-length']||0);if(!n){try{n=(await r.body()).length}catch{n=0}}
  rows.push([n,new URL(r.url()).pathname])}catch{}
})
await p.goto('http://127.0.0.1:4321'+(process.argv[2]||'/'),{waitUntil:'networkidle',timeout:60000})
await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
await p.waitForTimeout(3000)
rows.sort((a,b)=>b[0]-a[0])
console.log('First-party assets by size:')
for(const [n,u] of rows.slice(0,16)) console.log((n/1024).toFixed(0).padStart(7)+'KB  '+u)
console.log('\nTOTAL first-party:',(rows.reduce((a,r)=>a+r[0],0)/1024).toFixed(0),'KB in',rows.length,'requests')
await b.close()
