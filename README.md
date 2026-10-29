# Business Process Modeling and Optimization under Resource Constraints

Based on the seven slides in `BPM Optimization under Resource Constraints-1.pptx` (the supplied folder contains a PowerPoint, not a PDF).

## Run on Windows

Requires a C++17 compiler. In PowerShell, open this folder and run:

```powershell
g++ -std=c++17 -O2 -Wall -Wextra -pedantic main.cpp -o bpm_optimizer.exe
.\bpm_optimizer.exe
```

Run the compiled executable from this folder so the three CSV output files appear here.

## Implemented behavior

Four sequential loan tasks: receive application (clerk), check documents (clerk), assess risk (analyst), approve (manager). Both clerk tasks share the same worker pool. Tasks are assigned in ready-time order to the earliest available qualified worker. A discrete-event simulation records completion, waiting and resource use. Work pauses outside an eight-hour daily shift and resumes next day; all days are working days.

NSGA-II uses nondominated sorting, crowding distance, binary tournament selection, uniform crossover, bounded integer mutation and elitist survival. It minimizes average elapsed cycle time and staffing cost, rejecting allocations above budget. Population size is 40 and the search runs for 80 generations.

For this small demo, all feasible allocations are simulated once and cached. The optimizer searches those cached evaluations. Exhaustive enumeration independently identifies the exact Pareto set for comparison. This makes validation easy but is not a scalable implementation for large processes; those should evaluate/cache candidates on demand.

## Illustrative inputs

- 400 applications; exponential interarrival times averaging 24 working minutes, mapped onto daily shifts. This is a fixed case count; arrivals are not cut off after day 20.
- Task durations follow gamma distributions with shape 4 and means 8, 15, 35 and 10 working minutes.
- Each role has 1?5 people; hourly costs are 15, 30 and 45 arbitrary cost units.
- Planning budget: 30,000 cost units. Staffing cost is headcount ? hourly rate ? 8 hours ? 20 days.
- Workload seed: 2026. Search seed: 42. Every candidate sees the same sampled workload.

Change constants near the top of `main.cpp` to explore other inputs, then rebuild. If changing the budget or minimum staffing, keep the hardcoded baseline feasible or adapt its lookup.

## Measured output from this demo

| Choice | Clerks | Analysts | Managers | Staffing cost | Mean cycle (elapsed min) | Mean wait (elapsed min) |
|---|---:|---:|---:|---:|---:|---:|
| A: baseline / lowest cost | 1 | 1 | 1 | 14,400 | 5,936.30 | 5,734.33 |
| B: balanced | 1 | 2 | 1 | 19,200 | 687.89 | 481.13 |
| C: fastest | 3 | 3 | 1 | 28,800 | 222.45 | 18.09 |

There are 125 allocations before budget filtering and 21 feasible ones afterward. The run recovered all 7 exact Pareto allocations. A Pareto allocation has no alternative that is at least as good on both objectives and strictly better on one. Balanced means the smallest Euclidean distance to the ideal point after normalizing the two objectives across the returned frontier; it is a suggested choice, not a universal business optimum.

## Outputs

- `all_allocations.csv`: all feasible allocations and their metrics.
- `nsga2_pareto.csv`: nondominated allocations returned by NSGA-II.
- `exact_pareto.csv`: exact frontier from exhaustive enumeration.
- `talking_points.md`: presentation split among three members, plus likely questions.

Utilization columns are fractions, so 0.75 means 75%. They use available working time from time zero until the final application finishes, including backlog clearance.

## Limits and next steps

This is an illustrative prototype, not real bank data. It implements a fixed workflow directly in C++; it does not import or export BPMN or read real event logs. Skills are fixed role assignments. Calendars have identical daily shifts, without weekends, holidays or individual schedules. There are no branches, rework, loan rejections or parallel process tasks.

Cycle time includes nights and any shift interruption during service. Waiting measures time before each task begins, including closures; it excludes closures interrupting an already started task. Thus elapsed cycle time is not simply the sum of working service time and reported waiting.

The cost objective is the planned 20-day staffing cost. Simulation drains all cases even after day 20, so it does not charge extra backlog-clearance days. Add overtime/extended staffing cost or a completion deadline before using it for operational budgeting.

One seeded workload provides reproducibility, not statistical confidence. A stronger evaluation would use independent replications, confidence intervals, real logs and out-of-sample workloads. Future work can add BPMN import, richer calendars and comparisons with hill climbing or reinforcement learning, as proposed in the slides. No research papers have been independently reviewed as part of this implementation.

## Interactive presentation website

Double-click `open-website.cmd`, or open `bpm-site/dist/index.html` in your browser. Choose Present for six slides divided among three speakers. Close presentation mode to explore staffing sliders, budget constraints, the clickable Pareto chart and utilization. This interface uses the saved simulation results and works offline with fallback fonts. Website instructions are in `bpm-site/README.md`.

### New scenarios

Use **+ New scenario** to change demand, service durations, calendars, hourly costs, budget and seed. The website runs new browser simulations across all 125 teams and computes an exact Pareto frontier. It includes quick-start scenarios, browser-local saved inputs, JSON import/export, active-result CSV export, pinned comparisons and presentation slides that follow the active scenario. The browser engine uses its own RNG and exhaustive enumeration, separate from the original C++ NSGA-II reference. See `bpm-site/README.md` for assumptions and `node bpm-site/tests/simulation.test.cjs` for checks.

## BPMN process model

`loan_approval.bpmn` is a non-executable BPMN 2.0 model with diagram coordinates. Open it in a BPMN-compatible modeler. `loan_approval.svg` is the matching presentation preview. The website includes the diagram and BPMN download. It has one participant (loan approval), three role lanes, four user tasks, start/end events and five sequence flows. Both clerk tasks share the clerk pool in the simulator. There are no decision branches because the implemented model processes every application along the same route. The simulator does not parse BPMN XML; it implements this route directly.
