const $ = id => document.getElementById(id);
const roles = ['clerks','analysts','managers'];
const names = ['Clerks','Analysts','Managers'];
const rates = [15,30,45];
let selected = [1,2,1];
let cap = 30000;
const fmt = (n,d=0) => n.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const staffCost = s => s.reduce((sum,n,i)=>sum+n*rates[i]*160,0);
const same = (a,b) => roles.every(k=>a[k]===b[k]);
const frontier = ALLOCATIONS.filter(a=>!ALLOCATIONS.some(b=>b.staff_cost<=a.staff_cost && b.cycle_minutes<=a.cycle_minutes && (b.staff_cost<a.staff_cost || b.cycle_minutes<a.cycle_minutes))).sort((a,b)=>a.staff_cost-b.staff_cost);
const baseline = ALLOCATIONS[0];
const row = () => ALLOCATIONS.find(a=>roles.every((k,i)=>a[k]===selected[i]));
$('sliders').innerHTML=roles.map((r,i)=>`<div class="slider-row"><label for="${r}">${names[i]} <strong id="${r}-value">${selected[i]}</strong></label><input type="range" id="${r}" min="1" max="5" step="1" value="${selected[i]}"><small>${rates[i]} cost units / person-hour</small></div>`).join('');
roles.forEach((r,i)=>$(r).addEventListener('input',e=>{selected[i]=Number(e.target.value);render();}));
$('budget').addEventListener('input',e=>{cap=Number(e.target.value);render();});
function choices(){
 const f=frontier.filter(a=>a.staff_cost<=cap);
 const cheap=f[0], fast=f.reduce((a,b)=>a.cycle_minutes<b.cycle_minutes?a:b);
 const score=a=>Math.hypot((a.staff_cost-cheap.staff_cost)/Math.max(1,fast.staff_cost-cheap.staff_cost),(a.cycle_minutes-fast.cycle_minutes)/Math.max(1,cheap.cycle_minutes-fast.cycle_minutes));
 const balanced=f.reduce((a,b)=>score(a)<=score(b)?a:b);
 return {baseline:cheap,balanced,fastest:fast};
}
function choose(a){selected=roles.map(k=>a[k]);render();}
document.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>choose(choices()[b.dataset.choice])));
function render(){
 roles.forEach((r,i)=>{$(r).value=selected[i];$(r+'-value').textContent=selected[i];});
 $('budget-value').textContent=fmt(cap);
 const a=row(), cost=staffCost(selected), valid=cost<=cap;
 const isPareto=a && frontier.some(b=>same(a,b));
 $('cycle').textContent=a?fmt(a.cycle_minutes)+' min':'\u2014';
 $('wait').textContent=a?fmt(a.wait_minutes)+' min':'\u2014';
 $('cost').textContent=fmt(cost);
 $('improvement').textContent=a?fmt((1-a.cycle_minutes/baseline.cycle_minutes)*100,1)+'% lower than baseline':'Outside the evaluated 30,000-unit range';
 $('budget-left').textContent=valid?fmt(cap-cost)+' units below budget':fmt(cost-cap)+' units over budget';
 $('budget-left').style.color=valid?'':'#a34a2b';
 $('allocation-status').textContent=!a?'No saved simulation for this team. Choose a preset or reduce staffing.':!valid?'Over the selected budget. Results shown for comparison.':isPareto?'\u2713 Feasible \u00b7 Verified Pareto allocation':'Feasible \u00b7 Dominated by another allocation';
 const presets=choices();
 document.querySelectorAll('[data-choice]').forEach(b=>b.classList.toggle('active',!!a&&same(a,presets[b.dataset.choice])));
 $('utilization').innerHTML=roles.map((r,i)=>{const v=a?a[['clerk_utilization','analyst_utilization','manager_utilization'][i]]*100:0;return `<div><div class="util-label"><span>${names[i]}</span><strong>${a?fmt(v,1)+'%':'\u2014'}</strong></div><div class="bar"><i style="width:${v}%"></i></div></div>`;}).join('');
 $('insight').textContent=!a?'This team is outside the saved experiment. The simulator evaluated allocations up to a 30,000-unit budget; no result is invented for unevaluated teams.':a.analysts===1?'The analyst pool is almost fully occupied. Adding clerks or managers alone leaves risk assessment as the bottleneck. Try adding a second analyst.':a.clerks===1?'A second analyst removes much of the baseline queue. The shared clerk pool now has the highest utilization; try two clerks to explore the next capacity constraint.':`This allocation reduces mean cycle time by ${fmt((1-a.cycle_minutes/baseline.cycle_minutes)*100,1)}% compared with the baseline, at ${fmt((a.staff_cost/baseline.staff_cost-1)*100,1)}% higher planned staffing cost. Consider the marginal gain before adding more people.`;
 drawChart(a);
}
function drawChart(current){
 const x=c=>65+(c-14400)/15600*635, y=t=>270-t/6500*240;
 let svg='';
 for(let t=0;t<=6000;t+=2000) svg+=`<line x1="65" y1="${y(t)}" x2="700" y2="${y(t)}" stroke="#dce1d8" stroke-dasharray="3 5"/><text x="53" y="${y(t)+4}" text-anchor="end">${fmt(t)}</text>`;
 for(let c=14400;c<=30000;c+=4800) svg+=`<text x="${x(c)}" y="292" text-anchor="middle">${fmt(c/1000,1)}k</text>`;
 svg+='<text x="382" y="320" text-anchor="middle">Planned staffing cost (cost units)</text><text x="65" y="15">Mean cycle time \u00b7 elapsed minutes \u2193</text>';
 svg+=`<rect x="${x(cap)}" y="26" width="${Math.max(0,x(30000)-x(cap))}" height="244" fill="#e4e6df" opacity=".75"/>`;
 if(cap<30000) svg+=`<line x1="${x(cap)}" y1="26" x2="${x(cap)}" y2="270" stroke="#8b967f" stroke-dasharray="4 4"/><text x="${x(cap)-5}" y="42" text-anchor="end">Budget</text>`;
 svg+=`<polyline points="${frontier.map(a=>x(a.staff_cost)+','+y(a.cycle_minutes)).join(' ')}" fill="none" stroke="#285848" stroke-width="2"/>`;
 ALLOCATIONS.forEach((a,i)=>{
  const active=current&&same(a,current), p=frontier.some(b=>same(a,b));
  const title=`${a.clerks} clerks, ${a.analysts} analysts, ${a.managers} managers: cost ${fmt(a.staff_cost)}, cycle ${fmt(a.cycle_minutes,1)} minutes`;
  svg+=`<g class="point" tabindex="0" role="button" aria-label="${title}" data-index="${i}" opacity="${a.staff_cost>cap?.3:1}"><title>${title}</title>${active?`<circle cx="${x(a.staff_cost)}" cy="${y(a.cycle_minutes)}" r="12" fill="none" stroke="#758b3f" stroke-width="1.5"/>`:''}<circle cx="${x(a.staff_cost)}" cy="${y(a.cycle_minutes)}" r="${active?7:p?5:4}" fill="${active?'#d1dd78':p?'#285848':'#a6b3a5'}" stroke="#f6f7f3" stroke-width="1.5"/></g>`;
 });
 $('chart').innerHTML=svg;
 $('chart').querySelectorAll('[data-index]').forEach(g=>{
  const select=()=>choose(ALLOCATIONS[Number(g.dataset.index)]);
  g.addEventListener('click',select);
  g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
 });
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
function showSlide(){const s=slides[slide];$('slide-count').textContent=`PROCESS LAB / ${slide+1} OF ${slides.length}`;$('slide-content').innerHTML=`<div class="eyebrow">${s[0]}</div><h2>${s[1]}</h2><p>${s[2]}</p><p class="speaker">${s[3]}</p>`;$('prev-slide').disabled=slide===0;$('next-slide').disabled=slide===slides.length-1;}
$('present').addEventListener('click',()=>{slide=0;showSlide();$('presentation').showModal();});
$('close-slides').addEventListener('click',()=>$('presentation').close());
$('prev-slide').addEventListener('click',()=>{if(slide>0){slide--;showSlide();}});
$('next-slide').addEventListener('click',()=>{if(slide<slides.length-1){slide++;showSlide();}});
document.addEventListener('keydown',e=>{if(!$('presentation').open)return;if(e.key==='ArrowRight')$('next-slide').click();if(e.key==='ArrowLeft')$('prev-slide').click();});
$('print').addEventListener('click',()=>window.print());
render();
