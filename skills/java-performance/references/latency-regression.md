# Worked example: tail regression after a deploy

This example demonstrates uncertainty and branching rather than a prewritten GC conclusion.

## Symptom contract

After release `B`, client p50 is unchanged while p99 rises. First verify:

- identical metric definition/window/histogram bounds and enough samples;
- offered, accepted, successful, timeout, retry, and operation/payload mix;
- rollout cohort: old/new versions, pod age, zone/node, and traffic share;
- client and server timing alignment;
- no load-generator or dashboard query change.

Suppose the regression is isolated to warmed `B` pods under matched successful-work mix.

## Competing hypotheses

| Hypothesis                                               | Prediction                                                                      | Discriminator                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| new allocation pressure causes more critical-path GC/CPU | allocation per work and GC phase/frequency/resource correlate with slow windows | GC/JFR + allocation profile per operation              |
| logging serialization directly blocks/uses CPU           | serializer/log writer stacks and I/O/queue delay correlate independent of GC    | CPU/wall profile, logging queue/disk, code/config diff |
| downstream behavior changed                              | client spans/socket/timeout/retry distribution shifts                           | trace/dependency metrics and connection state          |
| rollout lifecycle/capacity                               | effect tracks new pod age/traffic ramp/replica availability                     | uptime, readiness, queues and per-pod traffic          |

## Evidence

Assume repeated matched windows show:

- allocation bytes per successful target operation rise materially in `B`;
- a new logging path serializes a request object, confirmed by allocation/CPU stacks;
- young-collection rate rises, but pause distribution overlap makes GC contribution to client
  p99 uncertain;
- synchronous log/export backpressure also appears in wall/JFR evidence.

The correct classification is “new logging path increases allocation and synchronous work,”
not automatically “GC is the root cause.” Both direct CPU/I/O and GC amplification remain in
the causal chain.

## Intervention and validation

Choose a behaviorally safe change: remove/reshape the unnecessary body logging or make payload
capture explicitly sampled/redacted/bounded, preserving required audit semantics. An
`isDebugEnabled` guard helps only if message construction truly occurs inside the guard and
debug logging is not required; parameterized APIs alone do not prevent every object/argument
construction.

Predeclare:

```text
expected: allocation/work and logging CPU/wait decrease
success: client p99 distribution and CPU/cost improve under matched repeated load
guardrails: audit observability, error rate, log loss/backpressure, privacy
```

Run paired/matched `A`, `B`, and fixed `C` trials. Confirm the target stack and allocation
change, but decide from external outcomes with uncertainty. Inspect whether bottleneck shifts.

## What is not justified

- Changing `MaxGCPauseMillis` from increased collection frequency alone. Collector ergonomics
  can alter young sizing/frequency/work in workload- and collector-specific ways.
- Claiming unchanged pause duration means pauses caused no p99 change; frequency and alignment
  with requests matter.
- Claiming allocation increase proves a leak; retention/lifetime evidence is separate.
- Claiming one before/after p99 point proves recovery.

## Handoff

- `allocation-profiling`: quantify sites/bytes and lifetime question.
- `gc-log-analysis`: establish phase/frequency/pause/concurrent CPU effects.
- `structured-logging`/delivery owner: logging semantics, backpressure, privacy.
- `performance-methodology`: causal validation.
- `performance-regression-ci`: add a calibrated allocation/resource guard only after a stable
  benchmark and meaningful threshold exist.
