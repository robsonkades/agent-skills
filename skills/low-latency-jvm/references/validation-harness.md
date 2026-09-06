# Validation harness

Use an open-loop generator or equivalent scheduled-arrival method; record intended and actual send
times so queueing delay is not omitted. Pin clocks, synchronization, warm-up, run duration, data,
CPU placement, frequency policy and background load. Preserve raw samples or a lossless-enough
histogram with range and precision.

Use a monotonic clock for same-process elapsed time. Cross-host one-way latency needs measured
clock offset/drift uncertainty smaller than the decision margin; otherwise use a suitable
round-trip boundary or qualify the result. Do not subtract unrelated percentiles or clock values.
Track scheduled, started, completed, timed-out, rejected and unfinished work by a declared cohort
and drain window. Corrected histograms cannot reconstruct unsent workload effects on the server.

The gate must include latency distribution, throughput/goodput, errors/drops, queue depth,
allocation, GC/JIT/safepoint events, CPU throttling/migrations and relevant network signals. Define
`PASS`, `FAIL` and `INCONCLUSIVE`; missing samples or profiler failure cannot pass.

Choose a required sample population and confidence treatment before interpreting p99.99. For a
fixed deadline and zero violations in n independent, identically distributed trials, the exact
one-sided 95% binomial upper bound on violation probability is `1 - 0.05^(1/n)`. At n=10,000,
it is about 0.000300, not evidence of a guaranteed 0.0001 violation rate. Correlated requests,
changing load and repeated looks invalidate that simple calculation; use run-level analysis and
the `latency-statistics` skill. This is deadline exceedance inference, not quantile interpolation.
See [NIST binomial intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm).

Run steady state, burst, saturation, recovery, restart/warm-up and a duration covering known periodic
events. Validate object-pool conservation and memory-exhaustion horizon where relevant. A result is
transferable only to the pinned environment and workload; state what it does not prove.
