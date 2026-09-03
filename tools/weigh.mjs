import { chromium } from 'playwright-core'
import { join } from 'node:path'
const EXEC=join(process.env.USERPROFILE||'','AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const BASE='http://127.0.0.1:4321'
const pages=process.argv.slice(2)
const b=await chromium.launch({executablePath:EXEC})
console.log('page'.padEnd(42),'reqs'.padStart(5),'total'.padStart(10),'img'.padStart(9),'css/js'.padStart(9))
for(const url of pages){
  const ctx=await b.newContext({viewport:{width:1440,height:900}})
  const p=await ctx.newPage()
  const seen=new Map()
  p.on('response',async r=>{
    try{
      const h=r.headers(); const len=Number(h['content-length']||0)
      let n=len; if(!n){ try{n=(await r.body()).length}catch{n=0} }
      seen.set(r.url(),{n,t:h['content-type']||''})
    }catch{}
  })
  await p.goto(BASE+url,{waitUntil:'networkidle',timeout:60000})
  await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
  await p.waitForTimeout(2500)
  let total=0,img=0,code=0
  for(const [u,{n,t}] of seen){ total+=n; if(/image/.test(t))img+=n; if(/javascript|css/.test(t))code+=n }
  const kb=x=>(x/1024).toFixed(0)+'KB'
  console.log(url.slice(0,40).padEnd(42),String(seen.size).padStart(5),kb(total).padStart(10),kb(img).padStart(9),kb(code).padStart(9))
  await ctx.close()
}
await b.close()
