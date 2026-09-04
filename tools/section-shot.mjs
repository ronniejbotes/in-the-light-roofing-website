/**
 * Screenshot individual <section> elements of a page by index, with motion
 * disabled. Full-page capture is unreliable on very tall pages.
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
// Set CHROME to a Chromium/Chrome binary; the default is Playwright's
// Windows download location.
const EXEC=process.env.CHROME||join(process.env.USERPROFILE||'','AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const url=process.argv[2]||'/'; const idxs=(process.argv[3]||'0').split(',').map(Number); const name=process.argv[4]||'seg'
await mkdir('shots',{recursive:true})
const b=await chromium.launch({executablePath:EXEC})
const ctx=await b.newContext({viewport:{width:1440,height:900}})
const p=await ctx.newPage()
await p.goto('http://127.0.0.1:4321'+url,{waitUntil:'networkidle',timeout:45000})
await p.addStyleTag({content:`*,*::before,*::after{animation:none!important;transition:none!important}
  .header{position:static!important}[data-reveal]{opacity:1!important;transform:none!important}
  .callbar,.to-top,iframe[src*="fastbots"],div[id*="fastbot"]{display:none!important}`})
await p.waitForTimeout(600)
const els=await p.$$('main > section')
console.log('sections:',els.length)
for(const i of idxs){
  if(!els[i]){console.log('  no section',i);continue}
  await els[i].scrollIntoViewIfNeeded(); await p.waitForTimeout(300)
  await els[i].screenshot({path:join('shots',`${name}-${i}.png`)}).catch(e=>console.log(' skip',i,e.message.slice(0,50)))
  console.log('  shot',i)
}
await b.close()
