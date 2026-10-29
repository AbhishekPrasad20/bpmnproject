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

// Illustrative inputs, not real loan-processing measurements.
constexpr int DAYS=20, SHIFT=480, DAY=1440, CASES=400;
constexpr double BUDGET=30000;
const array<double,3> WAGE={15,30,45}; // cost units per staffed hour
const array<double,4> MEAN={8,15,35,10}; // working minutes per task
const array<int,4> ROLE={0,0,1,2};
struct Case { double arrival; array<double,4> service; };
struct Result { double cycle=0, wait=0, cost=0; array<double,3> utilization{}; };
struct Individual { array<int,3> staff{}; Result result; int rank=0; double crowd=0; };
vector<Case> workload;
mt19937 rng(42);

double workingStart(double t) {
    double d=floor(t/DAY), m=t-d*DAY;
    return m>=SHIFT ? (d+1)*DAY : t;
}
double workingFinish(double t,double duration) {
    t=workingStart(t);
    while(duration>0) {
        double remaining=SHIFT-fmod(t,DAY);
        if(duration<=remaining+1e-9) return t+duration;
        duration-=remaining;
        t=(floor(t/DAY)+1)*DAY;
    }
    return t;
}
double costOf(const array<int,3>& s) {
    double c=0; for(int r=0;r<3;++r) c+=s[r]*WAGE[r]*SHIFT/60.0*DAYS; return c;
}
bool feasible(const array<int,3>& s) {
    return all_of(s.begin(),s.end(),[](int n){return n>=1 && n<=5;}) && costOf(s)<=BUDGET;
}
void makeWorkload() {
    // Common random numbers: every allocation sees exactly the same cases.
    mt19937 gen(2026);
    exponential_distribution<double> arrivals(CASES/double(DAYS*SHIFT));
    double active=0;
    for(int i=0;i<CASES;++i) {
        active+=arrivals(gen);
        Case c; c.arrival=floor(active/SHIFT)*DAY+fmod(active,SHIFT);
        for(int j=0;j<4;++j) {
            gamma_distribution<double> service(4.0,MEAN[j]/4.0);
            c.service[j]=service(gen);
        }
        workload.push_back(c);
    }
}
Result simulate(const array<int,3>& staff) {
    // Events enqueue tasks at their actual ready time; shared clerk pool is FCFS.
    struct Event {double time; int id,task;};
    auto cmp=[](const Event&a,const Event&b){
        if(a.time!=b.time) return a.time>b.time;
        if(a.id!=b.id) return a.id>b.id;
        return a.task>b.task;
    };
    priority_queue<Event,vector<Event>,decltype(cmp)> events(cmp);
    array<vector<double>,3> freeAt;
    for(int r=0;r<3;++r) freeAt[r].assign(staff[r],0);
    for(int i=0;i<CASES;++i) events.push({workload[i].arrival,i,0});
    Result out; out.cost=costOf(staff); array<double,3> busy{};
    double last=0;
    while(!events.empty()) {
        auto e=events.top(); events.pop();
        int r=ROLE[e.task];
        auto worker=min_element(freeAt[r].begin(),freeAt[r].end());
        double start=workingStart(max(e.time,*worker));
        double finish=workingFinish(start,workload[e.id].service[e.task]);
        *worker=finish;
        busy[r]+=workload[e.id].service[e.task];
        out.wait+=start-e.time;
        if(e.task<3) events.push({finish,e.id,e.task+1});
        else {out.cycle+=finish-workload[e.id].arrival; last=max(last,finish);}
    }
    out.cycle/=CASES; out.wait/=CASES;
    // Utilization over the full observation window, including backlog clearance.
    double available=floor(last/DAY)*SHIFT+min(double(SHIFT),fmod(last,DAY));
    for(int r=0;r<3;++r) out.utilization[r]=busy[r]/(staff[r]*available);
    return out;
}
bool dominates(const Individual&a,const Individual&b) {
    return a.result.cost<=b.result.cost && a.result.cycle<=b.result.cycle &&
        (a.result.cost<b.result.cost || a.result.cycle<b.result.cycle);
}
vector<vector<int>> rankPopulation(vector<Individual>& p) {
    int n=int(p.size()); vector<vector<int>> dominated(n), fronts(1); vector<int> count(n);
    for(int i=0;i<n;++i) {
        p[i].crowd=0;
        for(int j=0;j<n;++j) if(i!=j) {
            if(dominates(p[i],p[j])) dominated[i].push_back(j);
            else if(dominates(p[j],p[i])) ++count[i];
        }
        if(count[i]==0) { p[i].rank=0; fronts[0].push_back(i); }
    }
    for(size_t k=0;k<fronts.size();++k) {
        vector<int> next;
        for(int i:fronts[k]) for(int j:dominated[i]) if(--count[j]==0) {
            p[j].rank=int(k)+1; next.push_back(j);
        }
        if(!next.empty()) fronts.push_back(next);
    }
    for(auto f:fronts) for(int obj=0;obj<2;++obj) {
        auto value=[&](int i){return obj==0?p[i].result.cost:p[i].result.cycle;};
        sort(f.begin(),f.end(),[&](int a,int b){return value(a)<value(b);});
        double range=value(f.back())-value(f.front());
        if(range<=0) continue;
        p[f.front()].crowd=p[f.back()].crowd=numeric_limits<double>::infinity();
        for(size_t j=1;j+1<f.size();++j) p[f[j]].crowd+=(value(f[j+1])-value(f[j-1]))/range;
    }
    return fronts;
}
vector<Individual> pareto(vector<Individual> p) {
    auto f=rankPopulation(p); vector<Individual> out;
    for(int i:f[0]) out.push_back(p[i]);
    sort(out.begin(),out.end(),[](auto&a,auto&b){return a.result.cost<b.result.cost;});
    return out;
}
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
    makeWorkload();
    vector<Individual> all;
    for(int c=1;c<=5;++c) for(int a=1;a<=5;++a) for(int m=1;m<=5;++m) {
        array<int,3>s={c,a,m}; if(feasible(s)) all.push_back({s,simulate(s)});
    }
    if(all.empty()) throw runtime_error("No feasible allocation for this budget");
    const int POP=40, GENERATIONS=80;
    uniform_int_distribution<int> pick(0,int(all.size())-1), member(0,POP-1), gene(0,2), step(0,1);
    uniform_real_distribution<double> chance(0,1);
    vector<Individual> pop; for(int i=0;i<POP;++i) pop.push_back(all[pick(rng)]);
    auto lookup=[&](array<int,3>s){
        return *find_if(all.begin(),all.end(),[&](auto&x){return x.staff==s;});
    };
    for(int g=0;g<GENERATIONS;++g) {
        rankPopulation(pop);
        auto tournament=[&](){
            int a=member(rng),b=member(rng);
            return pop[a].rank<pop[b].rank || (pop[a].rank==pop[b].rank && pop[a].crowd>pop[b].crowd)?pop[a]:pop[b];
        };
        vector<Individual> combined=pop;
        for(int i=0;i<POP;++i) {
            auto a=tournament(),b=tournament(); auto s=a.staff;
            for(int r=0;r<3;++r) if(chance(rng)<0.5) s[r]=b.staff[r];
            if(chance(rng)<0.4) {int r=gene(rng); s[r]=clamp(s[r]+(step(rng)?1:-1),1,5);}
            // Reject infeasible offspring, preserving a feasible parent.
            combined.push_back(feasible(s)?lookup(s):a);
        }
        auto fronts=rankPopulation(combined); pop.clear();
        for(auto f:fronts) {
            sort(f.begin(),f.end(),[&](int a,int b){return combined[a].crowd>combined[b].crowd;});
            for(int i:f) if(int(pop.size())<POP) pop.push_back(combined[i]);
            if(int(pop.size())==POP) break;
        }
    }
    sort(pop.begin(),pop.end(),[](auto&a,auto&b){return a.staff<b.staff;});
    pop.erase(unique(pop.begin(),pop.end(),[](auto&a,auto&b){return a.staff==b.staff;}),pop.end());
    auto found=pareto(pop), exact=pareto(all);
    writeCSV("all_allocations.csv",all); writeCSV("nsga2_pareto.csv",found); writeCSV("exact_pareto.csv",exact);
    cout<<fixed<<setprecision(2)<<"Illustrative loan approval simulation; seed 2026, optimizer seed 42\n";
    cout<<"Feasible allocations: "<<all.size()<<"; NSGA-II Pareto allocations: "<<found.size()<<"; exact: "<<exact.size()<<'\n';
    int hits=0; for(auto&e:exact) for(auto&f:found) if(e.staff==f.staff) {++hits;break;}
    cout<<"Exact Pareto allocations recovered: "<<hits<<"/"<<exact.size()<<'\n';
    show("Baseline",lookup({1,1,1}));
    show("A - lowest cost",found.front());
    auto fast=min_element(found.begin(),found.end(),[](auto&a,auto&b){return a.result.cycle<b.result.cycle;});
    double cmin=found.front().result.cost,cmax=fast->result.cost,tmin=fast->result.cycle,tmax=found.front().result.cycle;
    auto score=[&](const Individual& x){return hypot((x.result.cost-cmin)/max(1.0,cmax-cmin),(x.result.cycle-tmin)/max(1.0,tmax-tmin));};
    auto balanced=min_element(found.begin(),found.end(),[&](auto&a,auto&b){return score(a)<score(b);});
    show("B - balanced (normalized distance to ideal)",*balanced); show("C - fastest",*fast);
    cout<<"CSV files written. Cycle and waiting times include overnight closures.\n";
    return 0;
} catch(const exception&e) {cerr<<e.what()<<'\n';return 1;} }
