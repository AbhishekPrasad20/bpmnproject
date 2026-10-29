const assert=require('node:assert/strict');
require('../dist/simulation.js');
const sim=globalThis.BPMSim;
const c={name:'Test',cases:40,arrival:24,shift:480,days:20,means:[8,15,35,10],rates:[15,30,45],budget:30000,seed:2026};
async function main(){
 assert.deepEqual(sim.workload(c),sim.workload(c),'Seed must reproduce the workload');
 assert.notDeepEqual(sim.workload(c),sim.workload({...c,seed:7}));
 assert.throws(()=>sim.validate({...c,budget:1}),/at least/);
 assert.throws(()=>sim.validate({...c,cases:Infinity}),/Invalid cases/);
 assert.throws(()=>sim.validate({...c,means:[0,1,1,1]}),/Task means/);
 const w=[{arrival:0,service:[10,10,10,10]},{arrival:0,service:[10,10,10,10]}];
 const hand=sim.simulate(c,[1,1,1],w);
 assert.equal(hand.cycle_minutes,55,'Shared clerk queue must schedule both cases correctly');
 assert.equal(hand.wait_minutes,15);
 const overnight=sim.simulate({...c,shift:60},[1,1,1],[{arrival:55,service:[10,1,1,1]}]);
 assert.equal(overnight.cycle_minutes,1393,'Service must pause at shift closure');
 assert.equal(overnight.wait_minutes,0,'Closures during service are not queue wait');
 const rows=await sim.run(c);
 assert.equal(rows.length,125);
 assert.equal(new Set(rows.map(r=>[r.clerks,r.analysts,r.managers].join('/'))).size,125);
 for(const r of rows){
  assert.equal(r.staff_cost,sim.cost(c,[r.clerks,r.analysts,r.managers]));
  assert(r.cycle_minutes>=r.wait_minutes&&r.wait_minutes>=0);
  for(const k of ['clerk_utilization','analyst_utilization','manager_utilization'])assert(r[k]>=0&&r[k]<=1+1e-10);
 }
 const feasible=rows.filter(r=>r.staff_cost<=c.budget),front=sim.pareto(feasible);
 assert(front.length>0);
 for(const a of front)assert(!feasible.some(b=>b.staff_cost<=a.staff_cost&&b.cycle_minutes<=a.cycle_minutes&&(b.staff_cost<a.staff_cost||b.cycle_minutes<a.cycle_minutes)));
 assert.deepEqual(rows,await sim.run(c));
 console.log('PASS: hand-calculated shared queue, overnight service, deterministic workloads, input bounds, 125 unique teams, costs, utilization and Pareto invariants.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
