# Process Lab website

Open `dist/index.html` directly in Chrome or Edge, or double-click `../open-website.cmd`. No server, installation or account is required. Fonts fall back to system fonts offline.

## Scenario workspace

Click **+ New scenario** in the header or experiment workspace. Choose Demand surge, Complex risk checks or Shorter shifts, or enter your own application count, mean arrival gap, shift length, planning days, four task durations, three hourly staffing costs, budget and seed. Click **Simulate scenario**.

New scenarios generate a fresh seeded workload and evaluate all 125 teams in your browser. Select teams using the sliders, presets or chart. Adjust the active budget to filter the exact frontier. Pin a team to compare a different staffing choice or a new scenario. Cross-scenario comparisons explicitly indicate that conditions differ.

The last eight scenario configurations are saved in this browser when storage is available. Switch scenarios using the dropdown. Export/import JSON preserves inputs and the active budget; imported inputs open for review before simulation. Export CSV downloads the active budget-feasible results. Original C++ downloads remain available separately at the bottom.

## Engines and interpretation

The original reference uses the checked-in C++ results: 400 cases, 21 feasible allocations, and seven exact Pareto choices recovered by NSGA-II in its seeded run. The hero and method validation panel are explicitly labeled as this reference experiment.

Custom scenarios use `dist/simulation.js`: a discrete-event simulator with the same sequential workflow, shared FCFS clerk pool, fixed role skills, shift interruptions and gamma shape-4 service distributions. Mulberry32 plus inverse-transform exponential samples provide an independent JavaScript random stream. An identical seed in C++ and JavaScript does not imply identical samples. All teams within one scenario receive the exact same generated workload.

Browser scenarios use exhaustive enumeration, **not NSGA-II**. The frontier is exact among the 125 evaluated teams for that sampled workload. The six presentation slides adapt to the active scenario and identify its engine.

Cases arrive until the chosen fixed case count is reached. Arrival gap is measured in working minutes. All days are working days. Cycle time includes overnight closures. Waiting includes closures before service starts, but excludes interruptions during service. Utilization is calculated through final completion. Cost is planned staffing cost for the chosen horizon and omits additional backlog-clearance days; the interface flags overruns when observed. Results are illustrative and need independent replications and real data for operational use.

## Present and verify

Choose **Present** for six slides assigned to three members. Use arrow keys and Escape. Close the slides to demonstrate the scenario builder and Pareto chart. Print opens the browser PDF dialog.

Run the simulator checks with:

```powershell
node tests/simulation.test.cjs
```

Checks cover a hand-calculated shared-resource queue, overnight interrupted service, reproducible workloads, invalid inputs, all 125 allocations, metric bounds, costs and Pareto invariants.
