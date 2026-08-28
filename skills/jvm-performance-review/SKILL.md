---
name: jvm-performance-review
description: >
  Auditing a supplied JVM configuration artefact: a command line or JVM_OPTS, a Kubernetes
  manifest with resource limits, a GC log or JFR summary offered as evidence, or a bare
  request for flags. Use when asked to review JVM flags, when inheriting forty accumulated
  flags, when a JDK upgrade needs old flags checked, when approving a collector or heap
  change, or when someone asks for "flags to fix p99" — where the answer is usually a
  missing measurement. Returns prioritised findings, each with the measurement that confirms
  or kills it. A bare request for flags belongs here even with no artefact: the deliverable
  is the refusal and the measurement to take. A symptom for diagnosis starts at
  java-performance. Not the process (performance-methodology), profiler choice
  (jfr-and-async-profiler), GC log depth (gc-log-analysis), collector and heap sizing
  (jvm-gc-tuning), container detection (container-awareness), -Xlog construction
  (unified-logging), source review (code-review), or CI gating (performance-regression-ci).
---

# JVM Performance Review

## Purpose

Take a configuration artefact somebody hands over and return prioritised findings about
it — not an investigation, not a tuning session.

The failure this prevents is the review performed by pattern-matching a flag list against
remembered advice, which produces recommendations that are already the ergonomic default,
already a silent no-op, or already fatal on the target release — delivered with no SLO
and no measurement behind them.

## The gate

**No flag recommendation without (a) the SLO it serves — a percentile, a threshold, and
the load it holds at — and (b) the measurement showing the JVM's default was
insufficient.**

When the request is "give me flags to fix p99" and nothing has been measured, the correct
output refuses the premise: name the single cheapest discriminating measurement, give the
exact command, and state what each possible result would mean. That refusal is this
skill's most valuable output. It is not a preamble to a flag list — there is no flag list
after it.

The gate constrains flags you would **add or change**. It does not constrain findings
_about_ the artefact: "this flag has been ignored since JDK 24" needs no SLO, because it
is an observation, not an optimisation.

## Workflow

1. **Pin the target JDK build.** `java -version`, or the base image tag. Every answer
   below changes by release, so an audit against an assumed release is worthless. If the
   fleet spans releases, audit against the lowest and the highest and report both — the
   flags that survive an upgrade are a separate finding from the flags that work today.
2. **Search for `-XX:+IgnoreUnrecognizedVMOptions` before reading any other flag.** It
   converts every expired or removed flag on the line from a startup failure into a silent
   no-op, which means **nothing else on that command line can be assumed to be in effect**.
   It is exactly the flag someone adds when a copied JDK-8 option stopped the JVM booting,
   so its presence predicts dead flags elsewhere. If present, this is finding #1 and the
   rest of the audit is provisional until `jcmd <pid> VM.flags` is produced.
3. **Classify every flag by lifecycle state** — live, deprecated (warns, still effective),
   obsolete (warns, value ignored), or expired/removed (JVM refuses to start). Read
   `references/flag-lifecycle.md`. A flag in the third state is worse than a dead flag: the
   configuration reads as if it does something.
4. **For each surviving flag, ask what it buys over the default.** Most do not survive
   this question. Read `references/flag-cost-and-defaults.md` for the ergonomic defaults
   by release and for the flags that exist but are near-always a mistake in production.
5. **Reconcile the JVM's view with the container's**, whenever the artefact is or includes
   a Kubernetes manifest, or mentions OOMKilled, CPU limits or throttling. Read
   `references/container-arithmetic.md`. The most common finding in this class is that the
   JVM sized itself for a machine the pod will never get.
6. **Apply the gate.** For every change you are about to propose, name the SLO and the
   measurement. Where either is missing, read `references/missing-measurements.md` and
   emit the command instead of the flag.
7. **Prioritise and emit** in the order below.

## Priority order

Findings are ranked by how far the running system is from what the artefact claims, then
by blast radius:

| Rank | Class                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| P1   | The JVM will not start, or a flag is accepted and ignored — the written configuration is not the running one                         |
| P2   | The JVM is running something the author does not believe it is: collector chosen by ergonomics, compressed oops off, wrong CPU count |
| P3   | A live flag that actively spends something: throughput, headroom, or a failure mode the default handled                              |
| P4   | A live flag that buys nothing over the default — noise that suppresses adaptation and will become a warning on a later release       |
| P5   | Missing observability: the measurement that would settle an open question was never configured                                       |

## Output shape

Every finding carries the JDK releases it holds for, **the measurement that would confirm
it**, and **the measurement that would kill it**. A finding with no falsifier is a
suspicion; label it as one.

Use the full block only for findings that change what someone does. Formatting every
lifecycle triviality this way trains the reader to skim past the one that matters.

```text
Evidence:       supplied JVM_OPTS, static; no running JVM inspected.
                "-XX:MaxRAMPercentage=85", no -Xmx. Manifest: node memory 128 Gi,
                no resources.limits.memory.
Observation:    a RAM-percentage flag is set explicitly and the heap is unbounded by -Xmx.
Inference:      setting MaxRAMPercentage makes the JVM disable compressed oops when the
                resulting heap exceeds the compressed-oops range, instead of capping the
                heap at it. With no memory limit the base is the node's 128 Gi, so the
                heap lands near 108 GB — far above the ~32 GB range at the default
                8-byte object alignment.
Hypothesis:     this JVM runs with 64-bit references. The live set is larger than the
                same workload on a 31 GB heap, and GC has more to trace, which is the
                opposite of the intent behind raising the percentage.
Recommendation: read usesCompressedOops before changing the number —
                `jfr view heap-configuration app.jfr`, or `-Xlog:gc+init`.
                If it is false, the question is whether the workload's live set genuinely
                exceeds 32 GB, not what the percentage should be.
Confidence:     LOW
Reason:         read from a static artefact only. No running JVM, no heap-configuration
                event, no live-set measurement. The inference depends on the JVM seeing
                the full node memory, which a limit set elsewhere would falsify.
Confirms it:    usesCompressedOops = false in jdk.GCHeapConfiguration.
Kills it:       usesCompressedOops = true — the heap ended below the compressed-oops
                threshold, so it never reached the size the percentage implies. That
                says the sizing assumption was wrong, not why: a cgroup memory limit,
                an -Xmx later on the command line, the JVM seeing less memory than the
                node advertises, or an explicit -XX:+UseCompressedOops — which on the
                ergonomic path caps MaxHeapSize at ~32 GB instead of turning compressed
                oops off. That last one is the trap: measured on 25.0.3, adding the flag
                to -XX:MaxRAM=128g -XX:MaxRAMPercentage=85 took the heap from 108 GB to
                30 GB while the artefact still reads MaxRAMPercentage=85. Read
                MaxHeapSize off the running JVM before choosing between them.
```

## Rules

- **Version-scope every flag claim.** "Removed" without a release number is not a finding.
  The same flag refuses to start on one release, warns on another, and is silently ignored
  on a third — that is the point of the lifecycle.
- **Never quote a performance number without its provenance**: JDK build, hardware,
  workload, heap size and measurement method. Several widely repeated figures have no
  published source at all — the throughput cost of `-XX:TieredStopAtLevel=1` and the
  startup cost of `-XX:+AlwaysPreTouch` among them. For those, state the mechanism, state
  that the magnitude is unpublished, and name what to measure locally. A number invented
  to sound concrete is worse than no number.
- **A flag that restates the default is a finding, not a neutral.** It suppresses the
  JVM's own adaptation, it survives the release where the default changes, and it makes
  the real decisions on the line harder to see.
- **Do not recommend removing a flag whose effect you have not established.** "It looks
  unnecessary" is a P4 finding with an explicit test, not a change.
- **`jcmd <pid> VM.flags` outranks the command line.** The artefact says what was passed;
  only the JVM says what took effect. Where they can disagree — and after step 2 they
  usually can — say so rather than auditing the text alone.
- **Emit LOW when the evidence is static.** Most audits are performed on text with no
  running JVM, and almost every conclusion drawn that way is LOW by construction. A review
  that reports HIGH on every finding is not calibrated; it has hidden the fact that it
  read a file rather than a system.
- **Refuse gracefully.** When the gate blocks the request, give the command, the artefact
  it produces, and the branch each result leads to. "Profile it" is not an answer; a named
  command with a named discriminator is.

## References

- [Flag lifecycle matrix](references/flag-lifecycle.md) — the deprecated / obsolete /
  expired state of the flags that actually turn up in inherited configurations, with what
  the JVM does today on JDK 21, 25 and 26, and the folklore each row corrects. Read at
  step 3, for any artefact containing flags.
- [Flag cost and ergonomic defaults](references/flag-cost-and-defaults.md) — what each
  commonly-set flag spends, what it buys, and the measurement that would prove it helped;
  plus the defaults it is competing against by release. Read at step 4, once a flag is
  known to be live.
- [Container arithmetic](references/container-arithmetic.md) — how a manifest's `limits`
  and `requests` become the JVM's processor count, heap and collector, and the one command
  that settles it. Read at step 5, whenever a container is in scope.
- [Missing measurements](references/missing-measurements.md) — for each complaint, the
  single cheapest discriminating evidence, as an exact command, and what its absence means
  for the audit. Read at step 6, and whenever the request is for flags rather than for a
  review.
