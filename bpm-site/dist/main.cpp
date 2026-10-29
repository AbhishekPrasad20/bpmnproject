#include <algorithm>
#include <array>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <numeric>
#include <queue>
#include <random>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

// Loan approval demo: generate cases, simulate staffing choices, then search
// for cost/time trade-offs with NSGA-II. All time values are in minutes.
// Illustrative inputs, not real loan-processing measurements.
// DAYS is the staffing-cost horizon; SHIFT is working minutes per day,
// DAY includes overnight closure, and CASES is the fixed application count.
constexpr int DAYS=20, SHIFT=480, DAY=1440, CASES=400;
constexpr double BUDGET=30000;
const array<double,3> WAGE={15,30,45}; // cost units per staffed hour
const array<double,4> MEAN={8,15,35,10}; // working minutes per task
// Role indices: 0 = clerk, 1 = analyst, 2 = manager.
// Receive and document-check tasks both use the same clerk pool.
const array<int,4> ROLE={0,0,1,2};
// One application: elapsed arrival time and sampled working time for each task.
struct Case { double arrival; array<double,4> service; };
// Average elapsed cycle/wait times, planned staffing cost, and utilization fractions.
struct Result { double cycle=0, wait=0, cost=0; array<double,3> utilization{}; };
// An NSGA-II candidate. staff = {clerks, analysts, managers}.
// Lower rank is better; larger crowding distance preserves diverse trade-offs.
struct Individual { array<int,3> staff{}; Result result; int rank=0; double crowd=0; };
vector<Case> workload;
mt19937 rng(42); // Fixed optimizer seed makes this run reproducible.

// If a task becomes ready after the shift closes, move it to the next shift.
// All days are working days in this simplified calendar.
double workingStart(double t) {
    double d=floor(t/DAY), m=t-d*DAY;
    return m>=SHIFT ? (d+1)*DAY : t;
}
// Consume service time only during shifts. Pause unfinished work overnight.
double workingFinish(double t,double duration) {
    t=workingStart(t);
    while(duration>0) {
        double remaining=SHIFT-fmod(t,DAY);
        // Small tolerance avoids floating-point errors at the shift boundary.
        if(duration<=remaining+1e-9) return t+duration;
        duration-=remaining;
        t=(floor(t/DAY)+1)*DAY;
    }
    return t;
}
// Planned cost = people * hourly wage * hours per shift * planning days.
// Extra days needed to clear a backlog are NOT charged by this objective.
double costOf(const array<int,3>& s) {
    double c=0; for(int r=0;r<3;++r) c+=s[r]*WAGE[r]*SHIFT/60.0*DAYS; return c;
}
// Enforce 1-5 people per role and the total staffing budget.
bool feasible(const array<int,3>& s) {
    return all_of(s.begin(),s.end(),[](int n){return n>=1 && n<=5;}) && costOf(s)<=BUDGET;
}
void makeWorkload() {
    // Common random numbers: every allocation sees exactly the same cases.
    mt19937 gen(2026);
    // Exponential interarrival times average 24 working minutes by default.
    // The loop generates CASES applications; it does not stop at day DAYS.
    exponential_distribution<double> arrivals(CASES/double(DAYS*SHIFT));
    double active=0;
    for(int i=0;i<CASES;++i) {
        active+=arrivals(gen);
        // Convert cumulative working minutes to elapsed calendar minutes.
        Case c; c.arrival=floor(active/SHIFT)*DAY+fmod(active,SHIFT);
        for(int j=0;j<4;++j) {
            // Gamma mean = shape * scale = 4 * (MEAN[j] / 4).
            gamma_distribution<double> service(4.0,MEAN[j]/4.0);
            c.service[j]=service(gen);
        }
        workload.push_back(c);
    }
}
Result simulate(const array<int,3>& staff) {
    // Events enqueue tasks at their actual ready time; shared clerk pool is FCFS.
    struct Event {double time; int id,task;};
    // priority_queue normally returns the largest item. Reverse comparisons
    // to process the earliest ready task first; IDs break ties deterministically.
    auto cmp=[](const Event&a,const Event&b){
        if(a.time!=b.time) return a.time>b.time;
        if(a.id!=b.id) return a.id>b.id;
        return a.task>b.task;
    };
    priority_queue<Event,vector<Event>,decltype(cmp)> events(cmp);
    // Each entry records when one worker in that role becomes available.
    array<vector<double>,3> freeAt;
    for(int r=0;r<3;++r) freeAt[r].assign(staff[r],0);
    // Initially, every application is waiting for its first task.
    for(int i=0;i<CASES;++i) events.push({workload[i].arrival,i,0});
    Result out; out.cost=costOf(staff); array<double,3> busy{};
    double last=0;
    while(!events.empty()) {
        auto e=events.top(); events.pop();
        int r=ROLE[e.task];
        // Assign the earliest available worker qualified for this task.
        auto worker=min_element(freeAt[r].begin(),freeAt[r].end());
        // Both the case and worker must be ready, and the shift must be open.
        double start=workingStart(max(e.time,*worker));
        double finish=workingFinish(start,workload[e.id].service[e.task]);
        *worker=finish; // Reserve this worker through task completion.
        busy[r]+=workload[e.id].service[e.task];
        // Queue wait includes closures before service begins, but excludes
        // overnight interruptions after service has already started.
        out.wait+=start-e.time;
        // Make the next task ready at completion, or record the finished case.
        if(e.task<3) events.push({finish,e.id,e.task+1});
        else {out.cycle+=finish-workload[e.id].arrival; last=max(last,finish);}
    }
    // Convert accumulated case times to per-application averages.
    out.cycle/=CASES; out.wait/=CASES;
    // Utilization over the full observation window, including backlog clearance.
    double available=floor(last/DAY)*SHIFT+min(double(SHIFT),fmod(last,DAY));
    for(int r=0;r<3;++r) out.utilization[r]=busy[r]/(staff[r]*available);
    return out;
}
// A dominates B when A is no worse in either objective and strictly better
// in at least one. Both staffing cost and cycle time are minimized.
bool dominates(const Individual&a,const Individual&b) {
    return a.result.cost<=b.result.cost && a.result.cycle<=b.result.cycle &&
        (a.result.cost<b.result.cost || a.result.cycle<b.result.cycle);
}
// NSGA-II nondominated sorting plus crowding-distance calculation.
// Return fronts of candidate indices: front 0 is the best Pareto layer.
vector<vector<int>> rankPopulation(vector<Individual>& p) {
    // dominated[i] lists candidates beaten by i; count[i] counts its dominators.
    int n=int(p.size()); vector<vector<int>> dominated(n), fronts(1); vector<int> count(n);
    for(int i=0;i<n;++i) {
        p[i].crowd=0;
        for(int j=0;j<n;++j) if(i!=j) {
            if(dominates(p[i],p[j])) dominated[i].push_back(j);
            else if(dominates(p[j],p[i])) ++count[i];
        }
        if(count[i]==0) { p[i].rank=0; fronts[0].push_back(i); }
    }
    // Remove each front conceptually; newly unopposed candidates form the next.
    for(size_t k=0;k<fronts.size();++k) {
        vector<int> next;
        for(int i:fronts[k]) for(int j:dominated[i]) if(--count[j]==0) {
            p[j].rank=int(k)+1; next.push_back(j);
        }
        if(!next.empty()) fronts.push_back(next);
    }
    // Crowding distance measures spacing within a front, normalized separately
    // for cost and time. Favor isolated points to avoid a clustered frontier.
    for(auto f:fronts) for(int obj=0;obj<2;++obj) {
        auto value=[&](int i){return obj==0?p[i].result.cost:p[i].result.cycle;};
        sort(f.begin(),f.end(),[&](int a,int b){return value(a)<value(b);});
        double range=value(f.back())-value(f.front());
        if(range<=0) continue;
        // Protect the extreme cost/time points when this objective has a range.
        p[f.front()].crowd=p[f.back()].crowd=numeric_limits<double>::infinity();
        for(size_t j=1;j+1<f.size();++j) p[f[j]].crowd+=(value(f[j+1])-value(f[j-1]))/range;
    }
    return fronts;
}
// Extract nondominated candidates and order them by increasing cost.
vector<Individual> pareto(vector<Individual> p) {
    auto f=rankPopulation(p); vector<Individual> out;
    for(int i:f[0]) out.push_back(p[i]);
    sort(out.begin(),out.end(),[](auto&a,auto&b){return a.result.cost<b.result.cost;});
    return out;
}
// Export one staffing choice and its metrics per row for the website/analysis.
void writeCSV(const string& filename,const vector<Individual>& p) {
    ofstream f(filename); if(!f) throw runtime_error("Cannot write "+filename);
    f<<"clerks,analysts,managers,staff_cost,cycle_minutes,wait_minutes,clerk_utilization,analyst_utilization,manager_utilization\n";
    f<<fixed<<setprecision(4);
    for(auto &x:p) {
        f<<x.staff[0]<<','<<x.staff[1]<<','<<x.staff[2]<<','<<x.result.cost<<','<<x.result.cycle<<','<<x.result.wait;
        for(double u:x.result.utilization) f<<','<<u;
        f<<'\n';
    }
}
void show(const string& name,const Individual& x) {
    cout<<name<<": staff ("<<x.staff[0]<<", "<<x.staff[1]<<", "<<x.staff[2]<<") cost="<<x.result.cost
        <<" cycle="<<x.result.cycle<<" min wait="<<x.result.wait<<" min\n";
}
int main() { try {
    // 1. Generate one workload shared by every candidate for a fair comparison.
    makeWorkload();
    // 2. Enumerate the tiny search space (5^3 = 125), keeping feasible teams.
    // Cache simulations here; NSGA-II reuses them rather than resimulating.
    // Enumeration also supplies the exact frontier used to check the heuristic.
    vector<Individual> all;
    for(int c=1;c<=5;++c) for(int a=1;a<=5;++a) for(int m=1;m<=5;++m) {
        array<int,3>s={c,a,m}; if(feasible(s)) all.push_back({s,simulate(s)});
    }
    if(all.empty()) throw runtime_error("No feasible allocation for this budget");
    // 3. Start NSGA-II with a random feasible population (duplicates allowed).
    const int POP=40, GENERATIONS=80;
    uniform_int_distribution<int> pick(0,int(all.size())-1), member(0,POP-1), gene(0,2), step(0,1);
    uniform_real_distribution<double> chance(0,1);
    vector<Individual> pop; for(int i=0;i<POP;++i) pop.push_back(all[pick(rng)]);
    // Call only with feasible allocations already present in the cache.
    auto lookup=[&](array<int,3>s){
        return *find_if(all.begin(),all.end(),[&](auto&x){return x.staff==s;});
    };
    // 4. Evolve the population through repeated selection and reproduction.
    for(int g=0;g<GENERATIONS;++g) {
        rankPopulation(pop);
        // Binary tournament: prefer lower rank, then greater crowding distance.
        auto tournament=[&](){
            int a=member(rng),b=member(rng);
            return pop[a].rank<pop[b].rank || (pop[a].rank==pop[b].rank && pop[a].crowd>pop[b].crowd)?pop[a]:pop[b];
        };
        // Keep parents alongside offspring so good existing choices can survive.
        vector<Individual> combined=pop;
        for(int i=0;i<POP;++i) {
            auto a=tournament(),b=tournament(); auto s=a.staff;
            // Uniform crossover: independently inherit each role from either parent.
            for(int r=0;r<3;++r) if(chance(rng)<0.5) s[r]=b.staff[r];
            // Mutation: with 40% probability, change one role by +/-1, within bounds.
            if(chance(rng)<0.4) {int r=gene(rng); s[r]=clamp(s[r]+(step(rng)?1:-1),1,5);}
            // Reject infeasible offspring, preserving a feasible parent.
            combined.push_back(feasible(s)?lookup(s):a);
        }
        // Elitist survival: take better fronts first; use crowding distance
        // to decide who fits when only part of a front can survive.
        auto fronts=rankPopulation(combined); pop.clear();
        for(auto f:fronts) {
            sort(f.begin(),f.end(),[&](int a,int b){return combined[a].crowd>combined[b].crowd;});
            for(int i:f) if(int(pop.size())<POP) pop.push_back(combined[i]);
            if(int(pop.size())==POP) break;
        }
    }
    // 5. Remove duplicate staffing choices before extracting the search frontier.
    sort(pop.begin(),pop.end(),[](auto&a,auto&b){return a.staff<b.staff;});
    pop.erase(unique(pop.begin(),pop.end(),[](auto&a,auto&b){return a.staff==b.staff;}),pop.end());
    auto found=pareto(pop), exact=pareto(all);
    // Compare heuristic results with exhaustive search; full recovery in this
    // seeded example is evidence for this run, not a general NSGA-II guarantee.
    writeCSV("all_allocations.csv",all); writeCSV("nsga2_pareto.csv",found); writeCSV("exact_pareto.csv",exact);
    cout<<fixed<<setprecision(2)<<"Illustrative loan approval simulation; seed 2026, optimizer seed 42\n";
    cout<<"Feasible allocations: "<<all.size()<<"; NSGA-II Pareto allocations: "<<found.size()<<"; exact: "<<exact.size()<<'\n';
    int hits=0; for(auto&e:exact) for(auto&f:found) if(e.staff==f.staff) {++hits;break;}
    cout<<"Exact Pareto allocations recovered: "<<hits<<"/"<<exact.size()<<'\n';
    // 6. Report representative options. The hardcoded baseline must be feasible.
    show("Baseline",lookup({1,1,1}));
    show("A - lowest cost",found.front());
    auto fast=min_element(found.begin(),found.end(),[](auto&a,auto&b){return a.result.cycle<b.result.cycle;});
    double cmin=found.front().result.cost,cmax=fast->result.cost,tmin=fast->result.cycle,tmax=found.front().result.cycle;
    // Balanced option: normalize cost/time ranges, then minimize Euclidean
    // distance to the ideal (lowest cost, lowest time) point on this frontier.
    auto score=[&](const Individual& x){return hypot((x.result.cost-cmin)/max(1.0,cmax-cmin),(x.result.cycle-tmin)/max(1.0,tmax-tmin));};
    auto balanced=min_element(found.begin(),found.end(),[&](auto&a,auto&b){return score(a)<score(b);});
    show("B - balanced (normalized distance to ideal)",*balanced); show("C - fastest",*fast);
    cout<<"CSV files written. Cycle and waiting times include overnight closures.\n";
    return 0;
} catch(const exception&e) {cerr<<e.what()<<'\n';return 1;} }
