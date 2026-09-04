# Validation harness

Use an open-loop generator or equivalent scheduled-arrival method; record intended and actual send
times so queueing delay is not omitted. Pin clocks, synchronization, warm-up, run duration, data,
CPU placement, frequency policy and background load. Preserve raw samples or a lossless-enough
histogram with range and precision.

The gate must include latency distribution, throughput/goodput, errors/drops, queue depth,
allocation, GC/JIT/safepoint events, CPU throttling/migrations and relevant network signals. Define
`PASS`, `FAIL` and `INCONCLUSIVE`; missing samples or profiler failure cannot pass.

Run steady state, burst, saturation, recovery, restart/warm-up and a duration covering known periodic
events. Validate object-pool conservation and memory-exhaustion horizon where relevant. A result is
transferable only to the pinned environment and workload; state what it does not prove.
