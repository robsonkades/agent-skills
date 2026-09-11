---
name: low-latency-jvm
description: >
  Designing and validating JVM systems whose primary objective is bounded jitter rather than low
  average latency: latency-distribution budgets, allocation strategy, GC choice, warm-up and
  deoptimization, CPU/NUMA placement, busy-spin cost and evidence for kernel bypass. Use when
  p99.99-to-p50 spread matters, a trading or real-time path claims to be GC-free, CPUs are isolated,
  Epsilon or busy waiting is proposed, or an optimization shifts jitter between JVM, OS and network.
  General tail diagnosis belongs to tail-latency-analysis; individual JVM and OS mechanisms retain
  their specialist owners.
---

# Low-Latency JVM

## Purpose

Compose JVM, operating-system and transport controls around a jitter objective. This skill owns the
end-to-end design and validation contract; it does not replace the skills that diagnose GC, JIT,
NUMA, allocation or networking.

## Determinism contract

Define the event population, clock and boundaries, offered-load model, warm-up/state, p50/p99/p99.9/
p99.99 or maximum observation, acceptable spread, loss/rejection, throughput, run duration and
environment. Distinguish an empirical tail objective from a hard deadline guarantee: a finite
run bounds its observations, not every future execution. General-purpose JVM/OS measurements
alone do not prove hard real-time behavior, even with no observed GC pauses.

Inspect the project's JDK/collector, build and dependency versions, runtime image, kernel and
resource limits before selecting controls. This skill contains design guidance, not executable
Java or a required Java baseline. Do not upgrade or enable experimental flags merely to apply it.

## Workflow

Start from the requested claim and reuse applicable measurements, configuration and acceptance
criteria. Preserve an adequate design and its workload model. A narrow statistical or mechanism
review may need only a supported finding and remaining uncertainty; use the steps and campaigns
that can change the decision, without requiring a new capture or tuning change on every activation.

1. Allocate a distribution budget to application, queues, JVM pauses/compilation, scheduling,
   memory locality, kernel/network and dependencies without adding component percentiles.
2. Match latency generation to the actual workload: independent arrivals need a verified open
   schedule; completion-paced populations need representative concurrency and think times.
   Preserve scheduled/start delay and missing outcomes where applicable. For attribution, select
   timestamped JVM, scheduler, CPU, NUMA, IRQ, page-fault or network evidence that distinguishes
   the suspected causes; missing diagnostic data limits those claims.
3. When a change is justified, address one evidenced source of jitter and compare its costs.
   Preserve throughput, correctness and overload behavior; otherwise return no change or a
   discriminating next check with the hypothesis explicit.
4. Validate changed behavior over a window covering the relevant periodic effects, warm-up
   transitions and rare-event objective. Reuse sufficient evidence; compare distributions and
   raw outliers with their uncertainty, not only means.
5. Select restart, burst, saturation and recovery scenarios for the lifecycle and capacity claims
   being made. A steady-state result alone does not establish behavior through those transitions;
   when overload behavior matters, verify admission, outcomes and recovery as well as latency.

## Decision rules

- Prefer GC-friendly design and a measured low-pause collector before GC-free execution. Epsilon is
  viable only with a bounded allocation/lifetime budget and completion or controlled replacement
  before exhaustion. Include startup, libraries, background work, bursts and shutdown allocations;
  a steady-state mean rate is not an upper bound. No GC does not mean no safepoints or OS stalls.
- An object pool needs a checked conservation invariant, bounded capacity and safe reset/ownership.
  Measure total allocation, retained footprint, contention and latency against ordinary allocation.
  Small wrapper allocation may still accompany useful reuse of expensive resources; reject a pool
  when its measured benefit does not justify retention, synchronization or ownership risks.
- Pre-touch changes page commitment/startup; it does not enable huge pages or prove NUMA locality.
- Pin CPU, memory and interrupts as one placement design. CPU affinity without memory/IRQ placement
  can move rather than remove jitter.
- Busy spin spends dedicated cores and power and can starve GC/JIT/OS work. Use it only where the
  latency distribution pays for that reserved capacity.
- Kernel bypass is justified only after kernel/network time is a material part of the measured
  budget. It does not repair GC, NUMA, queues or application allocation.
- Never copy a JVM flag block. Confirm support, effective value and mechanism on the exact build.

## Output

Return the scoped finding or verdict and its evidence, any justified control with its cost or
an explicit no-change decision, and observed versus pending validation. For empirical claims,
state the acceptance population/window and remaining failure modes. Distinguish a measured source
from a hypothesis, and statistical evidence from a separately justified guarantee; a narrow review
does not require a full design report.

## References

- [Runtime and OS controls](references/runtime-and-os-controls.md) — read when choosing GC-free,
  affinity, NUMA, warm-up, busy-spin or kernel-bypass controls.
- [Validation harness](references/validation-harness.md) — read when designing or reviewing the
  latency experiment and its acceptance gate.
