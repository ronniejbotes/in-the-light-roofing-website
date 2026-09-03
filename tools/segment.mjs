import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
const OUT='shots'; const BASE='http://127.0.0.1:4321'
const EXEC=join(process.env.USERPROFILE||'','AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const url=process.argv[2]||'/'; const sel=process.argv[3]; const name=process.argv[4]||'seg'
await mkdir(OUT,{recursive:true})
const b=await chromium.launch({executablePath:EXEC})
const ctx=await b.newContext({viewport:{width:1440,height:900}})
const p=await ctx.newPage()
await p.goto(BASE+url,{waitUntil:'networkidle',timeout:45000})
await p.addStyleTag({content:`*,*::before,*::after{animation:none!important;transition:none!important}
  .header{position:static!important}[data-reveal]{opacity:1!important;transform:none!important}`})
await p.waitForTimeout(500)
if(sel){
  const els=await p.$$(sel)
  console.log(`${els.length} matches for ${sel}`)
  for(let i=0;i<Math.min(els.length,8);i++){
    await els[i].scrollIntoViewIfNeeded()
    await p.waitForTimeout(250)
    await els[i].screenshot({path:join(OUT,`${name}-${i}.png`)}).catch(e=>console.log('  skip',i,e.message.slice(0,40)))
  }
} else {
  await p.screenshot({path:join(OUT,`${name}.png`)})
}
await b.close()
