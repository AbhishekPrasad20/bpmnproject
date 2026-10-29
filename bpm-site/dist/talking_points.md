# Presentation talking points for three members

Suggested duration: about 6?8 minutes total. The source slides describe a proposal; the new code now provides a toy implementation with measured illustrative results.

## Member 1 ? Problem and process model (slides 1?2 and 4, about 2 minutes)

?Good morning. Our project is Business Process Modeling and Optimization under Resource Constraints. A business process consists of tasks that compete for limited people, machines and budget. When capacity is too low, applications wait in queues and completion takes longer.

Our example is loan approval. An application goes through four tasks: receiving the application, checking documents, assessing risk and final approval. Clerks handle the first two tasks, analysts assess risk and managers approve the application. The two clerk tasks share the same staff pool.

The decision is how many people to assign to each role. We allow one to five people per role, giving 125 possible allocations before applying the budget. Adding staff can reduce delay, but also increases cost. We therefore need to compare both objectives together.

The current prototype represents this workflow directly in C++. All task times and costs are illustrative assumptions, not data from a real bank.?

Handoff: ?Member 2 will explain how we simulate the process and search for resource allocations.?

## Member 2 ? Simulation and optimization (slide 3 and code demo, about 2?3 minutes)

?Our simulator generates 400 applications and processes events in time order. Each task must wait until a worker with the required role is available. Workers have an eight-hour daily shift; unfinished tasks resume during the next shift.

For each allocation, we measure mean cycle time, mean waiting time, staffing cost and utilization. Cycle time is the elapsed time from arrival to final approval. Every allocation receives the same generated applications so that comparisons use the same workload.

We use NSGA-II, a multi-objective genetic algorithm. It starts with a population of feasible staffing choices. It ranks candidates by dominance and uses crowding distance to keep diverse cost?time trade-offs. Selection, crossover and mutation create new candidates; elitist survival keeps the next population. Our demo uses 40 candidates and 80 generations.

The constraints include one to five staff per role, fixed role skills, the daily calendar and a 30,000-unit staffing budget. Infeasible offspring are rejected. For this small example, evaluations are cached from the 21 budget-feasible allocations. Exhaustive search also supplies the exact frontier so we can check the optimizer.?

Demo: run `.\bpm_optimizer.exe` from PowerShell. Point out the recovered Pareto count and the generated CSV files.

Handoff: ?Member 3 will interpret the trade-offs and explain the limitations.?

## Member 3 ? Results, trade-offs and next steps (slides 5?7, about 2?3 minutes)

?NSGA-II recovered all seven exact Pareto allocations in this seeded example. Pareto means that improving one objective requires sacrificing the other, among the alternatives evaluated.

The cheapest allocation has one clerk, one analyst and one manager. It costs 14,400 units and has a mean cycle time of approximately 5,936 elapsed minutes. With one clerk, two analysts and one manager, cost rises to 19,200 units while cycle time falls to about 688 minutes. This shows that analyst capacity is a major bottleneck under our assumptions.

The fastest allocation has three clerks, three analysts and one manager. Its cost is 28,800 units and its cycle time is about 222 minutes. The balanced choice minimizes normalized distance to the ideal cost and time; the final decision still depends on business priorities.

These are simulated results, not real operational improvements. The calendar includes overnight closures, and the cost covers a fixed 20-day plan even if clearing the backlog takes longer. We would need to account for that additional staffing time in a production budget.

Our next steps are to use real event logs, run repeated experiments, add richer calendars and BPMN support, and compare with other optimization methods. The slides reference a resource-allocation survey, data-driven simulation research and Optimos as related work; we should consult those papers directly before discussing their detailed findings.?

## Questions any member may receive

**Why NSGA-II?** It can return multiple cost?time trade-offs in one search without first choosing a fixed weighted sum of the objectives.

**Why not simply enumerate all choices?** Enumeration is best for this tiny example and gives a validation reference. Larger role sets and schedules can make the search space too large. This version still precomputes the small search space for demonstration.

**What is the bottleneck?** In the baseline, analysts perform the longest task. Adding a second analyst produces a large reduction in mean cycle time in this workload; bottlenecks may shift as staffing changes.

**Does NSGA-II guarantee the optimum?** No. It is a heuristic. We verified full recovery against enumeration for this particular seeded run, not for arbitrary workloads.

**Are the numbers taken from the slides?** No. The slides give the process and method; the code adds explicit illustrative input assumptions and produces these results.

**Is BPMN implemented?** The task sequence is implemented directly. A BPMN diagram/parser is future work.

**Is cost actual spending?** It is planned staffing cost in arbitrary units over 20 days. Extended backlog-clearance cost is currently omitted.

**How can we trust the simulation?** It has deterministic seeds and uses identical sampled workloads across allocations. Stronger validation requires event-level checks, independent replications and comparison against real event logs.

## Live scenario demonstration (optional extra 1-2 minutes)

Member 1: Click New scenario and select Demand surge. Explain that a shorter arrival gap means applications arrive more frequently. Review the budget and keep the seed unchanged.

Member 2: Click Simulate scenario. Explain that the browser now runs a discrete-event simulation for every one of the 125 teams, using the same sampled workload for each team. The original C++ experiment uses NSGA-II; these new browser scenarios use exact enumeration. Do not call the new results a fresh NSGA-II run.

Member 3: Pin the current balanced team, select Fastest and discuss the extra cost versus time saving. Create Complex risk checks to show how changing service time shifts pressure toward analysts. Cross-scenario comparisons have different conditions and do not isolate staffing effects. Export the scenario JSON so the experiment can be reproduced.

The original C++ figures above remain reference results. Custom scenario results appear live in the interface and presentation mode. Different browser and C++ random generators mean identical seed numbers do not produce identical sampled workloads.
