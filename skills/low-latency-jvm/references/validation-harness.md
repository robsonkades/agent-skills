# Validation harness

Define the claim and reuse adequate existing evidence before choosing a run. For arrivals
independent of prior completion, use an open schedule and reconcile intended versus actual starts,
start delay and dropped work. For completion-paced users or workers, a closed population with
representative concurrency and think times is valid. A tool label or open configuration does not
prove scheduling fidelity; a closed test cannot establish an independent-arrival claim merely by
timing completed calls. See [k6 workload models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/)
and `coordinated-omission` for missing-arrival and timing analysis.

For a runtime comparison, pin clocks, synchronization, warm-up, run duration, data, CPU placement,
frequency policy and background load as relevant to the claim. Preserve raw samples or a
lossless-enough histogram with range and precision.

Use a monotonic clock for same-process elapsed time. Cross-host one-way latency needs measured
clock offset/drift uncertainty smaller than the decision margin; otherwise use a suitable
round-trip boundary or qualify the result. Do not subtract unrelated percentiles or clock values.
Track scheduled, started, completed, timed-out, rejected and unfinished work by a declared cohort
and drain window. Corrected histograms cannot reconstruct unsent workload effects on the server.

For an empirical latency acceptance gate, include the relevant latency distribution,
throughput/goodput and all required outcomes, including errors/drops and unfinished work.
Choose queue, allocation, GC/JIT/safepoint, CPU and network evidence for the mechanism or resource
claims under review. Predeclare `PASS`, `FAIL` and `INCONCLUSIVE`: missing required samples or
timing/outcome evidence cannot pass the affected claim. A failed optional profiler need not
invalidate independently complete latency evidence, but it cannot establish the causal explanation
that required that recording. Disclose the gap and qualify each conclusion separately.

Choose the sample population, stopping rule and confidence treatment before interpreting p99.99.
For a fixed deadline and a predeclared sample of n independent, identically distributed trials,
zero violations give the exact one-sided 95% binomial upper bound `1 - 0.05^(1/n)` on violation
probability. At n=10,000,
it is about 0.000300, not evidence of a guaranteed 0.0001 violation rate. Correlated requests or
changing load violate that model; use suitable run-level analysis and `latency-statistics`.
This is deadline exceedance inference, not quantile interpolation.
See [NIST binomial intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm).

Read the harness's stopping, counter-reset and window-selection logic before applying this bound.
Stopping on a favorable interim result or publishing the best quiet window requires inference
valid for that rule; ordinary fixed-n intervals do not provide simultaneous 95% coverage across
all looks. Merely reporting progress while keeping the predeclared final sample and analysis
unchanged does not invalidate that final interval. Preserve original outcomes and either retain
the planned terminal decision or justify a sequential method, such as an applicable
[confidence sequence](https://arxiv.org/abs/1810.08240), for decisions during sampling.

Choose steady state, burst, saturation, recovery, restart/warm-up and duration coverage from the
behavior changed or claimed. Existing matching evidence can suffice; a narrow inference review
does not require every campaign. Validate object-pool conservation and memory-exhaustion horizon
where relevant. State the tested environment/workload and the evidence needed before extending
the conclusion to other configurations or transitions.
