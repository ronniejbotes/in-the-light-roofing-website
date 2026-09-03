import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC=join(process.env.USERPROFILE||'','AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const b=await chromium.launch({executablePath:EXEC})
const ctx=await b.newContext({viewport:{width:1440,height:900}})
const p=await ctx.newPage()
const byHost=new Map()
p.on('response',async r=>{
  try{
    const h=r.headers(); let n=Number(h['content-length']||0)
    if(!n){try{n=(await r.body()).length}catch{n=0}}
    const host=new URL(r.url()).host
    const e=byHost.get(host)||{n:0,c:0}; e.n+=n; e.c++; byHost.set(host,e)
  }catch{}
})
await p.goto('http://127.0.0.1:4321'+(process.argv[2]||'/'),{waitUntil:'networkidle',timeout:60000})
await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
await p.waitForTimeout(3000)
const rows=[...byHost.entries()].sort((a,b)=>b[1].n-a[1].n)
console.log('host'.padEnd(34),'reqs'.padStart(5),'KB'.padStart(9))
let first=0,third=0
for(const [h,{n,c}] of rows){
  console.log(h.slice(0,32).padEnd(34),String(c).padStart(5),(n/1024).toFixed(0).padStart(9))
  if(h.startsWith('127.0.0.1'))first+=n; else third+=n
}
console.log('\nFIRST-PARTY:',(first/1024).toFixed(0),'KB   THIRD-PARTY:',(third/1024).toFixed(0),'KB')
await b.close()
