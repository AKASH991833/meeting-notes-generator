/* Meeting Notes Generator - decisions, actions, questions from transcripts */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const STOP=new Set(('a,an,the,and,or,but,if,then,else,when,at,by,for,with,about,into,to,from,in,out,on,of,it,its,this,that,these,those,we,our,us,i,you,your,he,she,they,them,their,is,are,was,were,be,been,have,has,had,do,does,did,will,would,could,should,can,may,might,must,shall,so,just,not,no,yes,yeah,okay,ok,right,well,like,know,think,going,gonna,really,thing,things,get,got,let,lets,me,my,say,said,see,now,also').split(','));

const SAMPLE=`Priya: Good morning everyone. Let's start with the launch date for the mobile app.
Marcus: I reviewed the timeline and I think we should push the launch to March 15th. The payment integration needs two more weeks.
Priya: Okay, decision: we launch on March 15th. No more slips after that.
Sofia: Agreed. I will update the press release and the website copy to reflect the new date.
Marcus: I can finish the payment integration by February 28th if I get help from the backend team.
Priya: James, can you assign someone from backend to help Marcus this week?
James: Yes, I'll assign Daniel to the payment work today. Action item for me.
Sofia: What about the app store review? That can take a week sometimes.
Priya: Good point. Marcus, please submit the build for review by March 1st so we have buffer.
Marcus: Will do. Also, we decided last week to drop the tablet layout for v1, just confirming that's still the plan.
Priya: Confirmed, tablet layout is out of scope for v1. We'll revisit after launch.
James: One concern - the crash rate on Android 12 is still at 2.3 percent. We need to fix that before launch.
Priya: That's a blocker. James, can your team investigate the Android 12 crashes and report back by Friday?
James: Yes, I'll have an answer by Friday. We think it's the image caching library.
Sofia: Should we schedule a go/no-go meeting for March 8th?
Priya: Yes, let's do the go/no-go on March 8th at 10am. I'll send the invite.
Marcus: I also want to flag that the onboarding flow still has no analytics events. We won't know where users drop off.
Priya: That's important. Sofia, can you work with Marcus to add analytics events to onboarding before the store submission?
Sofia: Sure, I'll add that to my list for this week.
Priya: Any other concerns before we wrap up?
James: No, I think we're aligned. Launch March 15th, go/no-go March 8th, crash fix by Friday.
Priya: Perfect. Thanks everyone.`;

function parseTurns(text){
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  const turns=[];let cur=null;
  for(const ln of lines){
    const m=ln.match(/^([A-Z][a-zA-Z]{1,20})(?:\s+[A-Z]\.?)?\s*:\s+(.*)$/);
    if(m){cur={speaker:m[1],text:m[2]};turns.push(cur);}
    else if(cur)cur.text+=' '+ln;
    else turns.push({speaker:null,text:ln});
  }
  return turns;
}
function sentences(text){return text.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(s=>s.split(/\s+/).length>=4);}

const DECISION_RE=/\b(decision:|we decided|we(?:'ll| will) go with|agreed\b|that(?:'s| is) (?:the plan|settled)|confirmed,|it'?s decided|final call)/i;
const ACTION_RE=/\b(i will|i'll|i can|can you|could you|please|action item|todo|to-do|needs? to|we need to|should (we|i)|assign|follow up|submit|send|prepare|draft|schedule|investigate|fix|update|add|review)\b/i;
const OWNER_RE=/\b([A-Z][a-z]+),?\s+(can you|could you|please)|^([A-Z][a-z]+)\b.*\b(I will|I'll|I can)\b/i;
const DUE_RE=/\b(by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|end of (day|week)|tomorrow|next week|\w+ \d{1,2}(st|nd|rd|th)?)|today|this week|before (the )?\w+|on \w+ \d{1,2}(st|nd|rd|th)?)\b/i;
const QUESTION_RE=/\?\s*$/;

function analyze(text){
  const turns=parseTurns(text);
  const decisions=[],actions=[],questions=[],allSents=[];
  for(const t of turns){
    for(const s of sentences(t.text)){
      const item={speaker:t.speaker,text:s};
      allSents.push(item);
      if(DECISION_RE.test(s))decisions.push(item);
      if(ACTION_RE.test(s)){
        let owner=t.speaker;
        const om=t.speaker&&s.match(/^(i will|i'll|i can)\b/i)?t.speaker:null;
        if(om)owner=om;
        const addr=t.text.match(/(?:^|,\s*)([A-Z][a-z]{2,20}),\s+(?:can you|could you|please)/);
        if(addr)owner=addr[1];
        const due=s.match(DUE_RE);
        actions.push({...item,owner,due:due?due[0].replace(/^by /,''):null});
      }
      if(QUESTION_RE.test(s)||/\b(what about|should we|do we|is that)\b.*\?/i.test(s))questions.push(item);
    }
  }
  // dedupe actions vs decisions overlap: keep action if it contains task verb even if decision-matched
  // talk share
  const share={};
  for(const t of turns){if(!t.speaker)continue;share[t.speaker]=(share[t.speaker]||0)+t.text.split(/\s+/).length;}
  // topics: top content words
  const freq={};
  for(const s of allSents)for(const w of s.text.toLowerCase().match(/[a-z][a-z'-]{2,}/g)||[]){if(STOP.has(w))continue;freq[w]=(freq[w]||0)+1;}
  const topics=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([w])=>w);
  // summary: top 3 sentences by idf score
  const df={};
  for(const s of allSents){const seen=new Set();for(const w of s.text.toLowerCase().match(/[a-z][a-z'-]{2,}/g)||[]){if(STOP.has(w))continue;if(!seen.has(w)){df[w]=(df[w]||0)+1;seen.add(w);}}}
  const scored=allSents.map((s,i)=>{let sc=0;const ws=s.text.toLowerCase().match(/[a-z][a-z'-]{2,}/g)||[];for(const w of ws){if(!STOP.has(w))sc+=1/(1+(df[w]||0));}return {...s,i,score:sc/Math.sqrt(ws.length||1)};}).sort((a,b)=>b.score-a.score).slice(0,3).sort((a,b)=>a.i-b.i);
  const words=text.split(/\s+/).length;
  return {turns,decisions,actions,questions,share,topics,summary:scored,words,speakers:Object.keys(share)};
}

let last=null;
function render(a){
  last=a;
  $('#minutes').classList.remove('hidden');
  $('#minMeta').textContent=`${a.words.toLocaleString()} words · ${a.speakers.length} speakers · ${a.turns.length} turns`;
  $('#kpis').innerHTML=[['Decisions',a.decisions.length],['Action items',a.actions.length],['Open questions',a.questions.length],['Speakers',a.speakers.length]]
    .map(([l,v])=>`<div class="card kpi"><div class="small muted">${l}</div><div class="kpi-val">${v}</div></div>`).join('');
  const item=(x,extra)=>`<div class="card card-pad-sm"><p>${esc(x.text)}</p><div class="row row-wrap mt8">${x.speaker?`<span class="chip chip-accent">${esc(x.speaker)}</span>`:''}${extra||''}</div></div>`;
  $('#decisions').innerHTML=a.decisions.length?a.decisions.map(d=>item(d)).join(''):'<p class="muted small">None detected.</p>';
  $('#actions').innerHTML=a.actions.length?a.actions.map(x=>item(x,`${x.owner?`<span class="chip chip-ok">Owner: ${esc(x.owner)}</span>`:''}${x.due?`<span class="chip chip-warn">Due: ${esc(x.due)}</span>`:''}`)).join(''):'<p class="muted small">None detected.</p>';
  $('#questions').innerHTML=a.questions.length?a.questions.map(q=>item(q)).join(''):'<p class="muted small">None detected.</p>';
  const total=Object.values(a.share).reduce((s,n)=>s+n,0)||1;
  $('#talkShare').innerHTML=Object.entries(a.share).sort((x,y)=>y[1]-x[1]).map(([sp,n])=>{
    const p=Math.round(n/total*100);
    return `<div><div class="row" style="justify-content:space-between"><b>${esc(sp)}</b><span class="small muted">${p}%</span></div><div style="height:8px;border-radius:99px;background:var(--accent-soft);margin-top:4px"><div style="height:100%;width:${p}%;border-radius:99px;background:var(--accent)"></div></div></div>`;
  }).join('');
  $('#summary').innerHTML=a.summary.map(s=>item(s)).join('');
  $('#topics').innerHTML=a.topics.map(t=>`<span class="chip">${esc(t)}</span>`).join('');
  $('#minutes').scrollIntoView({behavior:'smooth',block:'start'});
}

function go(){
  const t=$('#transcript').value.trim();
  if(t.split(/\s+/).length<50){toast('Paste at least a few turns of transcript.');return;}
  render(analyze(t));
}
function updateStats(){const t=$('#transcript').value.trim();$('#trStats').textContent=t?`${t.split(/\s+/).length.toLocaleString()} words pasted`:'';}
$('#transcript').addEventListener('input',updateStats);
$('#btnGo').addEventListener('click',go);
$('#btnSample').addEventListener('click',()=>{$('#transcript').value=SAMPLE;updateStats();go();});
$('#fileInput').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;$('#transcript').value=await f.text();updateStats();go();});
$('#btnExport').addEventListener('click',()=>{
  if(!last)return;const a=last;
  let md='# Meeting Minutes\n\n'+`Speakers: ${a.speakers.join(', ')}\n\n## Decisions\n\n`;
  for(const d of a.decisions)md+=`- ${d.text}${d.speaker?` (${d.speaker})`:''}\n`;
  md+='\n## Action items\n\n';
  for(const x of a.actions)md+=`- [ ] ${x.text}${x.owner?` - **${x.owner}**`:''}${x.due?` (due: ${x.due})`:''}\n`;
  if(a.questions.length){md+='\n## Open questions\n\n';for(const q of a.questions)md+=`- ${q.text}${q.speaker?` (${q.speaker})`:''}\n`;}
  md+='\n## Summary\n\n';for(const s of a.summary)md+=`- ${s.text}\n`;
  md+=`\n## Key topics\n\n${a.topics.join(', ')}\n\n_Generated from a transcript by rule-based extraction - review before circulating._\n`;
  download('meeting-minutes.md',md,'text/markdown');toast('Minutes downloaded');
});

window._test={analyze:()=>{const a=analyze(SAMPLE);render(a);return {turns:a.turns.length,speakers:a.speakers,decisions:a.decisions.length,actions:a.actions.map(x=>({owner:x.owner,due:x.due})),questions:a.questions.length,topics:a.topics};},
  state:()=>last?{actions:last.actions.length,decisions:last.decisions.length}:null,
  sample:()=>SAMPLE};
})();
