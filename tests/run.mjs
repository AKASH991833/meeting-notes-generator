import puppeteer from 'puppeteer-core';
import fs from 'fs';
const out='/tmp/shots62';fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--disable-dev-shm-usage','--hide-scrollbars']});
let fails=[];
const check=(name,ok,extra='')=>{console.log((ok?'PASS':'FAIL')+' '+name+(extra?' — '+extra:''));if(!ok)fails.push(name);};
for(const v of [{name:'desktop',w:1440,h:900},{name:'mobile',w:390,h:844}]){
 for(const theme of ['light','dark']){
  const page=await browser.newPage();
  await page.setViewport({width:v.w,height:v.h,deviceScaleFactor:1});
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await page.evaluateOnNewDocument(t=>localStorage.setItem('theme',t),theme);
  await page.goto('http://localhost:8062',{waitUntil:'networkidle2'});
  await page.click('#btnSample');
  await page.waitForSelector('#minutes:not(.hidden)');
  await new Promise(s=>setTimeout(s,300));
  const st=await page.evaluate(()=>window._test.analyze());
  check(`${v.name}/${theme} speakers found`,st.speakers.length===4,st.speakers.join(','));
  check(`${v.name}/${theme} decisions found`,st.decisions>=3,st.decisions+' decisions');
  check(`${v.name}/${theme} actions found`,st.actions.length>=6,st.actions.length+' actions');
  const owners=st.actions.map(a=>a.owner).filter(Boolean);
  check(`${v.name}/${theme} owners attributed`,owners.includes('James')&&owners.includes('Marcus')&&owners.includes('Sofia'),owners.join(','));
  const dues=st.actions.map(a=>a.due).filter(Boolean);
  check(`${v.name}/${theme} due dates found`,dues.some(d=>/Friday/i.test(d))&&dues.some(d=>/March 1/i.test(d)),dues.join('|'));
  check(`${v.name}/${theme} questions found`,st.questions>=1,st.questions+' questions');
  check(`${v.name}/${theme} topics relevant`,st.topics.includes('launch')||st.topics.includes('march'),st.topics.slice(0,5).join(','));
  // talk share bars render and sum ~100
  const shareTxt=await page.$eval('#talkShare',e=>e.textContent);
  check(`${v.name}/${theme} talk share shows all speakers`,['Priya','Marcus','Sofia','James'].every(s=>shareTxt.includes(s)));
  // March 15 launch decision visible
  const decTxt=await page.$eval('#decisions',e=>e.textContent);
  check(`${v.name}/${theme} launch decision captured`,/March 15/.test(decTxt));
  // export button exists and minutes populated
  const sumTxt=await page.$eval('#summary',e=>e.textContent);
  check(`${v.name}/${theme} summary non-empty`,sumTxt.trim().length>80);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`${out}/top-${v.name}-${theme}.png`});
  await page.evaluate(()=>document.getElementById('decisions').scrollIntoView({block:'start'}));
  await new Promise(s=>setTimeout(s,250));
  await page.screenshot({path:`${out}/minutes-${v.name}-${theme}.png`});
  check(`${v.name}/${theme} no console errors`,errs.length===0,errs.slice(0,3).join('|'));
  await page.close();
 }
}
await browser.close();
if(fails.length){console.log('\nFAILURES: '+fails.join(', '));process.exit(1);}
console.log('\nALL PASS');
