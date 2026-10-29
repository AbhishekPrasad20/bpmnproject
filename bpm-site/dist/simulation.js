/* Browser scenario engine. Same queue/calendar rules as main.cpp; independent RNG.
   Exhaustive enumeration is appropriate for 125 allocations. No NSGA-II claim. */
(function(root) {
 'use strict';
 const ROLE=[0,0,1,2], DAY=1440;
 function validate(c) {
  if(!c || typeof c.name!=='string' || !c.name.trim() || c.name.length>60) throw Error('Use a scenario name of 1-60 characters.');
  for(const [k,min,max,integer] of [['cases',20,1500,true],['arrival',1,240,false],['days',1,60,true],['shift',60,720,true],['budget',1,1000000,false],['seed',0,4294967295,true]]) {
   if(!Number.isFinite(c[k]) || c[k]<min || c[k]>max || (integer&&!Number.isInteger(c[k]))) throw Error('Invalid '+k+' value.');
  }
  if(!Array.isArray(c.means)||c.means.length!==4||c.means.some(n=>!Number.isFinite(n)||n<1||n>240)) throw Error('Task means must be 1-240 minutes.');
  if(!Array.isArray(c.rates)||c.rates.length!==3||c.rates.some(n=>!Number.isFinite(n)||n<1||n>500)) throw Error('Hourly costs must be 1-500 units.');
  if(c.budget<cost(c,[1,1,1])) throw Error('Budget must cover at least one person per role ('+Math.ceil(cost(c,[1,1,1]))+' units).');
  return c;
 }
 function random(seed) {
  return ()=>{seed=(seed+0x6D2B79F5)|0;let t=seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 }
 function workload(c) {
  const rng=random(c.seed), exp=mean=>-Math.log(Math.max(1e-12,1-rng()))*mean;
  let active=0;const out=[];
  for(let id=0;id<c.cases;id++) {
   active+=exp(c.arrival);
   out.push({arrival:Math.floor(active/c.shift)*DAY+active%c.shift,service:c.means.map(m=>exp(m/4)+exp(m/4)+exp(m/4)+exp(m/4))});
  }
  return out;
 }
 const less=(a,b)=>a.t<b.t || (a.t===b.t&&(a.id<b.id||(a.id===b.id&&a.task<b.task)));
 class Heap {
  constructor(){this.a=[];}
  push(v){let i=this.a.length;this.a.push(v);while(i>0){const p=(i-1)>>1;if(!less(v,this.a[p]))break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}
  pop(){const top=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(2*i+1<this.a.length){let j=2*i+1;if(j+1<this.a.length&&less(this.a[j+1],this.a[j]))j++;if(!less(this.a[j],last))break;this.a[i]=this.a[j];i=j;}this.a[i]=last;}return top;}
 }
 function start(t,shift){return t%DAY>=shift?(Math.floor(t/DAY)+1)*DAY:t;}
 function finish(t,d,shift){t=start(t,shift);while(d>0){const left=shift-t%DAY;if(d<=left+1e-9)return t+d;d-=left;t=(Math.floor(t/DAY)+1)*DAY;}return t;}
 function cost(c,s){return s.reduce((sum,n,i)=>sum+n*c.rates[i]*c.shift/60*c.days,0);}
 function simulate(c,s,w) {
  const free=s.map(n=>Array(n).fill(0)),busy=[0,0,0],events=new Heap();
  w.forEach((v,id)=>events.push({t:v.arrival,id,task:0}));
  let cycle=0,wait=0,last=0;
  while(events.a.length){
   const e=events.pop(),r=ROLE[e.task],pool=free[r];let worker=0;
   for(let i=1;i<pool.length;i++)if(pool[i]<pool[worker])worker=i;
   const begin=start(Math.max(e.t,pool[worker]),c.shift),end=finish(begin,w[e.id].service[e.task],c.shift);
   pool[worker]=end;busy[r]+=w[e.id].service[e.task];wait+=begin-e.t;
   if(e.task<3)events.push({t:end,id:e.id,task:e.task+1});
   else{cycle+=end-w[e.id].arrival;last=Math.max(last,end);}
  }
  const available=Math.floor(last/DAY)*c.shift+Math.min(c.shift,last%DAY);
  return {clerks:s[0],analysts:s[1],managers:s[2],staff_cost:cost(c,s),cycle_minutes:cycle/w.length,wait_minutes:wait/w.length,clerk_utilization:busy[0]/(s[0]*available),analyst_utilization:busy[1]/(s[1]*available),manager_utilization:busy[2]/(s[2]*available),completion_days:last/DAY};
 }
 function pareto(rows){return rows.filter(a=>!rows.some(b=>b.staff_cost<=a.staff_cost&&b.cycle_minutes<=a.cycle_minutes&&(b.staff_cost<a.staff_cost||b.cycle_minutes<a.cycle_minutes))).sort((a,b)=>a.staff_cost-b.staff_cost);}
 async function run(c,onProgress=()=>{}){
  validate(c);const w=workload(c),rows=[];
  for(let clerk=1;clerk<=5;clerk++)for(let analyst=1;analyst<=5;analyst++)for(let manager=1;manager<=5;manager++){
   rows.push(simulate(c,[clerk,analyst,manager],w));
   if(rows.length%5===0){onProgress(rows.length/125);await new Promise(resolve=>setTimeout(resolve,0));}
  }
  return rows;
 }
 root.BPMSim={validate,random,workload,simulate,pareto,cost,run};
})(globalThis);
