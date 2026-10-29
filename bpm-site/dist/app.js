const $ = id => document.getElementById(id);
const roles = ['clerks','analysts','managers'];
const names = ['Clerks','Analysts','Managers'];
const DEFAULT={name:'Original loan approval',cases:400,arrival:24,shift:480,days:20,means:[8,15,35,10],rates:[15,30,45],budget:30000,seed:2026};
const STORE='bpm-process-lab-scenarios-v1';
const fmt=(n,d=0)=>n.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let config=structuredClone(DEFAULT), dataset=ALLOCATIONS, original=true;
let selected=[1,2,1], cap=30000, frontier=[], baseline=ALLOCATIONS[0], busy=false;
let pinned={name:'Original / baseline',staff:[1,1,1],result:{...ALLOCATIONS[0]},config:JSON.stringify(DEFAULT)};
let scenarios=[];
try{const saved=JSON.parse(localStorage.getItem(STORE)||'[]');if(Array.isArray(saved))scenarios=saved.filter(c=>{try{BPMSim.validate(c);return true;}catch{return false;}}).slice(-8);}catch{/* Storage may be unavailable in private browsing. */}
const cache=new Map();
const same=(a,b)=>roles.every(k=>a[k]===b[k]);
const staffCost=s=>BPMSim.cost(config,s);
const row=()=>dataset.find(a=>roles.every((k,i)=>a[k]===selected[i]));
function feasible(){return dataset.filter(a=>a.staff_cost<=cap+1e-7);}
function updateFrontier(){frontier=BPMSim.pareto(feasible());}
function choices(){
 const cheap=frontier[0],fast=frontier.reduce((a,b)=>a.cycle_minutes<b.cycle_minutes?a:b);
 const score=a=>Math.hypot((a.staff_cost-cheap.staff_cost)/Math.max(1,fast.staff_cost-cheap.staff_cost),(a.cycle_minutes-fast.cycle_minutes)/Math.max(1,cheap.cycle_minutes-fast.cycle_minutes));
 return {baseline:cheap,balanced:frontier.reduce((a,b)=>score(a)<=score(b)?a:b),fastest:fast};
}
function choose(a){selected=roles.map(k=>a[k]);render();}
function mountControls(){
 $('sliders').innerHTML=roles.map((r,i)=>`<div class="slider-row"><label for="${r}">${names[i]} <strong id="${r}-value">${selected[i]}</strong></label><input type="range" id="${r}" min="1" max="5" step="1" value="${selected[i]}"><small>${fmt(config.rates[i])} cost units / person-hour</small></div>`).join('');
 roles.forEach((r,i)=>$(r).addEventListener('input',e=>{selected[i]=Number(e.target.value);render();}));
 const min=staffCost([1,1,1]);
 $('budget').min=min;$('budget').max=original?30000:Math.max(config.budget,staffCost([5,5,5]));$('budget').step='any';$('budget').value=cap;
 $('cost-horizon').textContent=`Cost units \u00b7 ${config.days} days \u00d7 ${config.shift/60} hours`;
}
$('budget').addEventListener('input',e=>{cap=Number(e.target.value);updateFrontier();render();});
document.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>choose(choices()[b.dataset.choice])));
function renderWorkspace(){
 $('scenario-title').textContent=config.name;
 const chips=[`${config.cases} applications`,`${config.arrival} min arrival gap`,`${config.shift/60}h shifts`,`Seed ${config.seed}`,`${feasible().length} feasible teams`,`${frontier.length} Pareto choices`];
 $('scenario-chips').innerHTML=chips.map(s=>`<span>${escapeHTML(s)}</span>`).join('');
 $('scenario-source').textContent=original?'C++ reference results / original seeded workload / NSGA-II verified against enumeration':'Live browser simulation / all 125 teams evaluated / exact frontier / independent JavaScript RNG';
 const flowLabels=document.querySelectorAll('.flow article small');
 ['CLERK','CLERK','ANALYST','MANAGER'].forEach((r,i)=>flowLabels[i].textContent=`${r} \u00b7 ${config.means[i]} MIN MEAN`);
 // The hero's baseline bottleneck is illustrative; the active model's measured utilization is below.
 document.querySelector('.flow article.risk')?.classList.remove('risk');
 const longest=config.means.indexOf(Math.max(...config.means));
 document.querySelectorAll('.flow article')[longest].classList.add('risk');
 const descriptions=['Register the incoming case.','Verify the required information.','Evaluate the application risk.','Complete the application.'];
 document.querySelectorAll('.flow article p').forEach((p,i)=>p.textContent=i===longest?'The longest mean service task.':descriptions[i]);
}
function render(){
 roles.forEach((r,i)=>{$(r).value=selected[i];$(r+'-value').textContent=selected[i];});
 $('budget-value').textContent=fmt(cap);$('budget').value=cap;
 const a=row(),cost=staffCost(selected),valid=cost<=cap+1e-7;
 const isPareto=a&&frontier.some(b=>same(a,b));
 $('cycle').textContent=a?fmt(a.cycle_minutes)+' min':'\u2014';$('wait').textContent=a?fmt(a.wait_minutes)+' min':'\u2014';$('cost').textContent=fmt(cost);
 const reduction=a?(1-a.cycle_minutes/baseline.cycle_minutes)*100:0;
 $('improvement').textContent=a?`${fmt(Math.abs(reduction),1)}% ${reduction>=0?'lower':'higher'} than this scenario's 1/1/1 team`:'Not evaluated in the C++ reference';
 $('budget-left').textContent=valid?fmt(cap-cost)+' units below budget':fmt(cost-cap)+' units over budget';$('budget-left').style.color=valid?'':'#a34a2b';
 $('allocation-status').textContent=!a?'No saved reference result for this team. Create a scenario to evaluate every team.':!valid?'Over the active budget. Results shown for comparison.':isPareto?'\u2713 Feasible \u00b7 Exact Pareto allocation':'Feasible \u00b7 Dominated by another allocation';
 const presets=choices();
 document.querySelectorAll('[data-choice]').forEach(b=>b.classList.toggle('active',!!a&&same(a,presets[b.dataset.choice])));
 const keys=['clerk_utilization','analyst_utilization','manager_utilization'];
 $('utilization').innerHTML=roles.map((r,i)=>{const v=a?a[keys[i]]*100:0;return `<div><div class="util-label"><span>${names[i]}</span><strong>${a?fmt(v,1)+'%':'\u2014'}</strong></div><div class="bar"><i style="width:${v}%"></i></div></div>`;}).join('');
 if(a){
  const values=keys.map(k=>a[k]),r=values.indexOf(Math.max(...values));
  $('insight').textContent=`${names[r]} have the highest observed utilization (${fmt(values[r]*100,1)}%). ${values[r]>.9?'This pool is close to full use; inspect its capacity before adding people elsewhere.':'Compare the Pareto choices before adding staff: additional capacity may bring only a small time saving.'} `+(a.completion_days>config.days?`Final completion occurs after about ${fmt(a.completion_days,1)} calendar days, beyond the ${config.days}-day planned cost horizon. Extra staffing days are not charged in this model.`:'');
 }else $('insight').textContent='Create a new scenario to simulate this allocation. The original reference contains only the 21 teams within its original budget.';
 $('pin-comparison').disabled=!a;
 renderWorkspace();renderComparison(a);drawChart(a);
}
function renderComparison(a){
 if(!pinned||!a){$('comparison-content').textContent='Select a measured team and pin it here to compare your next choice.';return;}
 const delta=(v,b,unit)=>`${v>=b?'+':''}${fmt(v-b,1)} ${unit}`;
 const sameWork=pinned.config===JSON.stringify(config);
 $('comparison-content').innerHTML=`<div class="compare-grid"><div><small>PINNED REFERENCE</small><strong>${escapeHTML(pinned.name)}</strong><span>${pinned.staff.join(' / ')} staff</span></div><div><small>CURRENT / ${escapeHTML(config.name)}</small><strong>${selected.join(' / ')} staff</strong><span>Clerks / analysts / managers</span></div><div><small>CYCLE TIME CHANGE</small><strong class="${a.cycle_minutes<=pinned.result.cycle_minutes?'positive':'negative'}">${delta(a.cycle_minutes,pinned.result.cycle_minutes,'min')}</strong><span>${fmt(pinned.result.cycle_minutes)} \u2192 ${fmt(a.cycle_minutes)} elapsed min</span></div><div><small>STAFFING COST CHANGE</small><strong>${delta(a.staff_cost,pinned.result.staff_cost,'units')}</strong><span>${fmt(pinned.result.staff_cost)} \u2192 ${fmt(a.staff_cost)} units</span></div></div><p class="caption">${sameWork?'Same scenario and sampled workload: this comparison isolates the staffing choice.':'Different scenarios: inputs or workloads differ, so the change cannot be attributed to staffing alone.'}</p>`;
}
$('pin-comparison').addEventListener('click',()=>{const a=row();if(a){pinned={name:config.name,staff:[...selected],result:{...a},config:JSON.stringify(config)};renderComparison(a);$('workspace-status').textContent='Reference pinned. Select another team or create a scenario to compare.';}});
function drawChart(current){
 const visible=dataset.filter(a=>a.staff_cost<=cap+1e-7||current&&same(a,current));
 const costs=visible.map(a=>a.staff_cost),min=Math.min(...costs),max=Math.max(cap,...costs,min+1),top=Math.max(1,...visible.map(a=>a.cycle_minutes))*1.08;
 const x=c=>65+(c-min)/(max-min)*635,y=t=>270-t/top*240;
 let svg='';
 for(let i=0;i<=3;i++){const t=top*i/3;svg+=`<line x1="65" y1="${y(t)}" x2="700" y2="${y(t)}" stroke="#dce1d8" stroke-dasharray="3 5"/><text x="53" y="${y(t)+4}" text-anchor="end">${fmt(t)}</text>`;}
 for(let i=0;i<=4;i++){const c=min+(max-min)*i/4;svg+=`<text x="${x(c)}" y="292" text-anchor="middle">${fmt(c/1000,1)}k</text>`;}
 svg+='<text x="382" y="320" text-anchor="middle">Planned staffing cost (cost units)</text><text x="65" y="15">Mean cycle time \u00b7 elapsed minutes \u2193</text>';
 if(cap<max)svg+=`<rect x="${x(cap)}" y="26" width="${x(max)-x(cap)}" height="244" fill="#e4e6df" opacity=".75"/><line x1="${x(cap)}" y1="26" x2="${x(cap)}" y2="270" stroke="#8b967f" stroke-dasharray="4 4"/>`;
 svg+=`<polyline points="${frontier.map(a=>x(a.staff_cost)+','+y(a.cycle_minutes)).join(' ')}" fill="none" stroke="#285848" stroke-width="2"/>`;
 // Render the selected point last, keeping it visible when metrics overlap.
 visible.sort((a,b)=>Number(!!current&&same(a,current))-Number(!!current&&same(b,current))).forEach(a=>{
  const i=dataset.indexOf(a),active=current&&same(a,current),p=frontier.some(b=>same(a,b));
  const title=`${a.clerks} clerks, ${a.analysts} analysts, ${a.managers} managers: cost ${fmt(a.staff_cost)}, cycle ${fmt(a.cycle_minutes,1)} minutes`;
  svg+=`<g class="point" tabindex="0" role="button" aria-label="${title}" data-index="${i}" opacity="${a.staff_cost>cap?.35:1}"><title>${title}</title>${active?`<circle cx="${x(a.staff_cost)}" cy="${y(a.cycle_minutes)}" r="12" fill="none" stroke="#758b3f" stroke-width="1.5"/>`:''}<circle cx="${x(a.staff_cost)}" cy="${y(a.cycle_minutes)}" r="${active?7:p?5:4}" fill="${active?'#d1dd78':p?'#285848':'#a6b3a5'}" stroke="#f6f7f3" stroke-width="1.5"/></g>`;
 });
 $('chart').innerHTML=svg;
 $('chart').querySelectorAll('[data-index]').forEach(g=>{const select=()=>choose(dataset[Number(g.dataset.index)]);g.addEventListener('click',select);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});});
}
function updatePicker(value='original'){
 $('scenario-picker').innerHTML='<option value="original">Original C++ reference</option>'+scenarios.map((c,i)=>`<option value="${i}">${escapeHTML(c.name)}</option>`).join('');$('scenario-picker').value=value;
}
function fillBuilder(c){
 const f=$('scenario-form').elements;
 for(const k of ['name','cases','arrival','days','budget','seed'])f.namedItem(k).value=c[k];
 f.namedItem('shiftHours').value=c.shift/60;
 c.means.forEach((n,i)=>f.namedItem('mean'+i).value=n);c.rates.forEach((n,i)=>f.namedItem('rate'+i).value=n);
 $('builder-error').textContent='';
 $('run-status').textContent='125 staffing choices. One reproducible workload.';
 $('run-progress').value=0;
}
function openBuilder(){fillBuilder({...structuredClone(config),name:original?'My scenario':config.name+' copy'});$('scenario-dialog').showModal();}
$('new-scenario').addEventListener('click',openBuilder);$('new-scenario-nav').addEventListener('click',openBuilder);
$('close-builder').addEventListener('click',()=>{if(!busy)$('scenario-dialog').close();});
$('scenario-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
document.querySelectorAll('[data-template]').forEach(b=>b.addEventListener('click',()=>{
 const c=structuredClone(DEFAULT);
 if(b.dataset.template==='demand'){c.name='Demand surge';c.cases=600;c.arrival=16;}
 if(b.dataset.template==='risk'){c.name='Complex risk checks';c.means[2]=70;}
 if(b.dataset.template==='short'){c.name='Shorter shifts';c.shift=360;c.budget=22500;}
 fillBuilder(c);
}));
function setBusy(value){busy=value;document.querySelectorAll('#scenario-form input,#scenario-form button,#scenario-picker,#new-scenario,#new-scenario-nav,#import-scenario').forEach(e=>e.disabled=value);$('run-progress').hidden=!value;$('scenario-form').setAttribute('aria-busy',String(value));}
async function activate(c,isOriginal=false){
 if(isOriginal){config=structuredClone(DEFAULT);dataset=ALLOCATIONS;original=true;cap=config.budget;}
 else{
  BPMSim.validate(c);const key=JSON.stringify(c);let rows=cache.get(key);
  if(!rows){rows=await BPMSim.run(c,n=>{$('run-progress').value=n;$('run-status').textContent=`Simulating teams: ${Math.round(n*125)} / 125`;$('workspace-status').textContent=`Simulating ${c.name}: ${Math.round(n*100)}%`;});cache.set(key,rows);}
  config=structuredClone(c);dataset=rows;original=false;cap=c.budget;
 }
 baseline=dataset.find(a=>a.clerks===1&&a.analysts===1&&a.managers===1);updateFrontier();
 selected=roles.map(k=>choices().balanced[k]);mountControls();render();
 $('workspace-status').textContent=original?'Original C++ reference restored.':`Ready: ${dataset.length} teams simulated. ${frontier.length} exact Pareto choices within the budget.`;
}
$('scenario-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;
 const f=$('scenario-form').elements,get=k=>Number(f.namedItem(k).value);
 const c={name:f.namedItem('name').value.trim(),cases:get('cases'),arrival:get('arrival'),shift:get('shiftHours')*60,days:get('days'),budget:get('budget'),seed:get('seed'),means:[0,1,2,3].map(i=>get('mean'+i)),rates:[0,1,2].map(i=>get('rate'+i))};
 try{BPMSim.validate(c);}catch(err){$('builder-error').textContent=err.message;return;}
 setBusy(true);$('builder-error').textContent='';$('run-progress').value=0;
 try{
  await activate(c);scenarios.push(c);scenarios=scenarios.slice(-8);updatePicker(String(scenarios.length-1));
  try{localStorage.setItem(STORE,JSON.stringify(scenarios));}catch{$('workspace-status').textContent+=' Browser storage unavailable; export the scenario to keep its inputs.';}
  $('scenario-dialog').close();$('lab').scrollIntoView({behavior:'smooth'});
 }catch(err){$('builder-error').textContent=err.message;$('workspace-status').textContent='Scenario failed. Previous results remain available.';}
 finally{setBusy(false);$('run-status').textContent='125 staffing choices. One reproducible workload.';}
});
$('scenario-picker').addEventListener('change',async()=>{
 const value=$('scenario-picker').value;setBusy(true);
 try{await activate(value==='original'?DEFAULT:scenarios[Number(value)],value==='original');}
 catch(err){$('workspace-status').textContent=err.message;}
 finally{setBusy(false);}
});
$('import-scenario').addEventListener('click',()=>$('scenario-file').click());
$('scenario-file').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(file.size>20000)throw Error('Scenario files must be smaller than 20 KB.');
  const data=JSON.parse(await file.text());
  if(data.version!==1||!data.config)throw Error('Choose a version 1 Process Lab scenario JSON.');
  const raw=data.config,c={name:raw.name,cases:raw.cases,arrival:raw.arrival,shift:raw.shift,days:raw.days,budget:raw.budget,seed:raw.seed,means:raw.means,rates:raw.rates};
  BPMSim.validate(c);fillBuilder(c);$('scenario-dialog').showModal();
  $('run-status').textContent='Imported inputs ready. Simulate to generate reproducible results.';
 }catch(err){$('workspace-status').textContent='Import failed: '+err.message;}
 finally{e.target.value='';}
});
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-scenario').addEventListener('click',()=>download('bpm-scenario.json',JSON.stringify({version:1,engine:original?'cpp-reference':'browser-exhaustive',config:{...config,budget:cap}},null,2),'application/json'));
$('export-results').addEventListener('click',()=>{const rows=feasible(),keys=Object.keys(rows[0]);download('bpm-scenario-results.csv',[keys.join(','),...rows.map(r=>keys.map(k=>r[k]).join(','))].join('\n'),'text/csv');});
updateFrontier();mountControls();updatePicker();
function activeSlides(){
 if(original)return slides;
 const out=slides.map(s=>[...s]),pick=choices();
 out[1][2]=`Receive (${config.means[0]} min) \u2192 Documents (${config.means[1]} min) \u2192 Risk (${config.means[2]} min) \u2192 Approve (${config.means[3]} min). Fixed role skills and a shared clerk pool.`;
 out[2][2]=`${config.name}: ${config.cases} applications, ${config.arrival} working minutes between arrivals on average, ${config.shift/60}-hour shifts. Seed ${config.seed}. All 125 teams receive the same sampled workload.`;
 out[3][1]='Enumerate the choices. Calculate the frontier.';
 out[3][2]=`This custom scenario uses browser discrete-event simulation and exhaustive enumeration, not NSGA-II. ${feasible().length} teams meet the active budget of ${fmt(cap)} units; ${frontier.length} are nondominated.`;
 out[4][1]='A new scenario. A new trade-off.';
 out[4][2]=`1/1/1 baseline: ${fmt(baseline.cycle_minutes)} min. Balanced team ${roles.map(k=>pick.balanced[k]).join('/')}: ${fmt(pick.balanced.cycle_minutes)} min at ${fmt(pick.balanced.staff_cost)} units. Fastest: ${fmt(pick.fastest.cycle_minutes)} min. These are new illustrative browser results.`;
 return out;
}
const slides=[
 ['THE PROBLEM','Less waiting. Smarter allocation.','A loan application competes for limited staff at four sequential tasks. We want shorter cycle time without exceeding the staffing budget.','Member 1 \u00b7 Problem & motivation'],
 ['THE MODEL','Four tasks. Three roles. One shared pool.','Receive \u2192 Check documents \u2192 Assess risk \u2192 Approve. Clerks perform the first two tasks. Analysts handle the longest task: 35 working minutes on average.','Member 1 \u00b7 Process & resource constraints'],
 ['THE EXPERIMENT','Simulate the same workload for every team.','400 applications. Eight-hour daily shifts. One to five people per role. Twenty-one allocations fit a 30,000-unit budget. All candidates see identical sampled arrivals and service times.','Member 2 \u00b7 Discrete-event simulation'],
 ['THE SEARCH','Find a frontier, not just one answer.','NSGA-II balances planned staffing cost and mean cycle time. Nondominated sorting and crowding distance preserve diverse trade-offs. The demo runs 40 candidates for 80 generations.','Member 2 \u00b7 NSGA-II \u00b7 Close to explore the live chart'],
 ['THE RESULTS','A second analyst changes the outcome.','Baseline 1/1/1: 5,936 min at 14,400 units. Balanced 1/2/1: 688 min at 19,200 units. Fastest 3/3/1: 222 min at 28,800 units. All seven exact Pareto allocations were recovered in this seeded run.','Member 3 \u00b7 Results & validation'],
 ['THE DISCUSSION','Defend the assumptions. Then extend the model.','Illustrative data, fixed role skills and no weekends. Planned cost omits extra backlog-clearance days. Next: independent replications, real event logs, BPMN import and richer calendars.','Member 3 \u00b7 Limitations & next steps']
];
let slide=0;
function showSlide(){const s=activeSlides()[slide];$('slide-count').textContent=`PROCESS LAB / ${slide+1} OF ${slides.length}`;$('slide-content').innerHTML=`<div class="eyebrow">${s[0]}</div><h2>${s[1]}</h2><p>${s[2]}</p><p class="speaker">${s[3]}</p>`;$('prev-slide').disabled=slide===0;$('next-slide').disabled=slide===slides.length-1;}
$('present').addEventListener('click',()=>{slide=0;showSlide();$('presentation').showModal();});
$('close-slides').addEventListener('click',()=>$('presentation').close());
$('prev-slide').addEventListener('click',()=>{if(slide>0){slide--;showSlide();}});
$('next-slide').addEventListener('click',()=>{if(slide<slides.length-1){slide++;showSlide();}});
document.addEventListener('keydown',e=>{if(!$('presentation').open)return;if(e.key==='ArrowRight')$('next-slide').click();if(e.key==='ArrowLeft')$('prev-slide').click();});
$('print').addEventListener('click',()=>window.print());
render();
