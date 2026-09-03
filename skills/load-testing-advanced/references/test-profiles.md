# Test Profiles and Boundary Procedure

## Profile contract

For every phase record:

- question and pass/fail/abort predicates;
- arrival process or closed population;
- load trajectory and evaluation window;
- workload/data/cache/dependency state;
- transition from the preceding phase;
- generator and target validity checks;
- expected qualitative response and falsifiers.

Never run smoke, warmup, breakpoint, stress and soak as an unlabelled continuous series.
Overload can leave queues, circuit breakers, caches or instances in a state that contaminates
later phases.

## Boundary search

Define:

\[
P(\lambda)=P_{latency}\land P_{outcome}\land P_{resource}\land P_{stability}
\]

Only assume monotonicity after checking it. Admission controls, cache changes, adaptive
algorithms and load balancing can make pass/fail non-monotone.

Procedure:

1. establish a reproducible passing load;
2. find a safely/reproducibly failing load;
3. refine the bracket using steps selected for the needed resolution;
4. hold each point long enough to cover stabilization and the SLO window;
5. repeat boundary points as independent runs, randomized/blocked where possible;
6. report \([\lambda_{pass},\lambda_{fail})\), run variability and why failure occurred.

If only discrete points were tested and monotonicity is uncertain, report the points rather
than an interval. A model-predicted boundary is labelled predicted until tested.

## Duration selection

Duration is constrained by the slowest relevant dynamics and required precision:

- JVM compilation/deoptimization and GC cycles;
- queue/controller/autoscaler settling and recovery;
- connection/cache/data adaptation;
- SLO evaluation window;
- enough events to estimate the selected tail with declared uncertainty;
- dependency rotations, quotas or background jobs.

Fixed 30–60-second steps can miss slow failure, while unnecessarily long overload can
damage shared systems. Define a minimum state/window criterion plus safety maximum.

## Stress and recovery

Overload levels should reveal whether the service:

- maintains useful throughput while shedding excess work;
- bounds queue age/memory and cancels expired work;
- avoids retry and health-check amplification;
- degrades fairly and preserves priority traffic;
- survives without restart;
- drains/rewarms and returns to baseline after load drops.

With unbounded queue and arrival greater than service, backlog grows. With finite admission,
rejection or abandonment, a lossy equilibrium can exist. Do not apply unbounded-queue
arithmetic to a shedding service.

## Spike and ramp

Represent both height and duration. Two spikes with equal peak but different area create
different backlog. Test known event shapes and adversarial impulse/ramp shapes within
authorized safety bounds.

For autoscaling, record:

```text
metric observation -> export/window -> controller decision -> scheduler
-> image/process startup -> readiness -> routing -> useful warm capacity
```

Use phase-aligned timelines. A successful replica-count increase is not proof that useful
capacity arrived before deadlines.

## Soak

Start with a retention hypothesis and a time-to-limit relevant to the decision. Keep
offered/admitted work and state stable enough to separate time effects.

Measure:

- comparable after-GC live-set/old-generation state;
- class loaders and metaspace;
- native-memory categories, direct buffers and RSS;
- threads/tasks, file descriptors and connection leases;
- caches/pools with documented bounds;
- queues, temp files, disk and observability buffers.

A slope model is evidence only when residuals, change points and cycles support it.
Bounded cache growth should plateau; leaks require retained ownership and reproducibility.
Estimate time-to-limit with uncertainty, and escalate to heap/native attribution tools.

Avoid scheduled explicit full GC by default. It alters the system and may not match
collector production behavior. Use comparable naturally occurring events or declare a
separate diagnostic experiment.

## Discrete latency thresholds

For a distribution with atoms, state the quantile convention. A strict threshold equal to
an atom can be impossible for a population quantile under one convention and fluctuate
under finite-sample interpolation. Derive the expected quantile/CDF, give real margin, and
test the same estimator the tool uses.

Do not claim all tools use linear interpolation; quantile estimators and histograms differ.
Pin the implementation and fixture-test boundary values.

## Publication

Publish:

- conditional scope and immutable configuration;
- profile, achieved workload and validity;
- bracketed boundary rather than false precision;
- run-level uncertainty and estimator;
- outcome/latency/resource evidence;
- overload and recovery behavior;
- censored/missing work treatment;
- raw artifacts and parser version;
- remaining unknowns and the next falsifying experiment.
