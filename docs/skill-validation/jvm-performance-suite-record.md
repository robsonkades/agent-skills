# Delivery record — JVM performance suite increment

**Date:** 2026-08-27. **Executed against:** Temurin 25.0.3+9 (Windows x64).
**Source-verified against:** OpenJDK JEP pages, pinned `openjdk/jdk` branches
(`jdk-21+35`, `jdk-25+36`, `jdk-26-ga`, `jdk27`), and the JDK 26 release notes.

## Scope, and why it is not the 21-skill catalogue that was requested

The requested catalogue of 21 `jvm-*` skills was surveyed against the repository first.
**Seventeen of the 21 topics already had an owner** — usually at finer granularity than
requested (G1 alone is `g1-internals`, `g1-concurrent-marking`, `g1-tuning-for-slo`).
Building the catalogue literally would have created 21 packages duplicating and
contradicting roughly 60 existing ones, failing the "scope hygiene" gate at scale.

Scope was therefore narrowed, with approval, to the genuine delta: two new skills, plus a
correction pass over claims that JDK 26/27 had made false. The `jlink` skill on the
original list was dropped as unjustified. `jvm-performance-for-distributed-systems`, which
the brief said should be reduced to a pointer, **has never existed in this repository** —
checked across all branches.

## Deliverable 1 — `unified-logging` v1.0.0

Owns constructing and _verifying_ a `-Xlog` configuration; the eight skills that consume
logs keep ownership of interpreting them. `gc-log-analysis` was narrowed in both its
`SKILL.md` and `skill.yaml` to cede the mechanics (this also repaired a pre-existing drift
where those two files carried different descriptions).

**Why it earns its place:** `-Xlog` fails three ways and two are silent. Executed here:
`-Xlog:gc+jit:file=t.log` exits 0, the JVM starts, the warning goes to **stdout**, and
`t.log` is **0 bytes** — the diagnostic never reaches the shipped artefact. A valid tag-set
at too high a level warns not at all.

**Validation:** 2 iterations. Iteration 1 FAIL — 1 BLOCKER, 3 MAJOR. Iteration 2 **PASS** —
0 BLOCKER, 0 MAJOR, 4 MINOR, 4 NIT.

The BLOCKER printed a JVM that does not start (`filecount` in the decorator field) as its
own evidence. The sharpest MAJOR was self-inflicted: the skill's mandated verification
command, `grep '\[gc,age\]'`, returns **zero hits on a working log**, because unified
logging pads the tags field to the width of the widest tag-set written so far — measured,
`grep '\[gc\]'` → 0 hits where `grep -E '\[gc[ ]*\]'` → 16. The skill's own check
manufactured the empty result it existed to detect.

## Deliverable 2 — `jvm-performance-review` v1.0.0

Audits a supplied artefact (command line, `JVM_OPTS`, GC log, JFR summary, K8s manifest)
and returns prioritised findings plus the missing measurements named explicitly.
`java-performance` routes a _symptom_; this reviews an _artefact_. Both directions are
stated in both descriptions, and `java-performance`'s routing table gained rows for both
new skills so they are reachable.

**The refusal gate is structural, not decorative.** It names the "flags to fix p99" prompt
verbatim, forbids a flag list after the refusal, and scopes itself correctly — it
constrains flags to _add or change_, not observations about the artefact, so the skill can
still do its job.

**Validation:** 2 iterations. Iteration 1 FAIL — 1 BLOCKER, 3 MAJOR. Iteration 2 **PASS** —
0 BLOCKER, 0 MAJOR, 6 MINOR, 5 NIT.

The BLOCKER: the `ActiveProcessorCount` pseudocode omitted `limit_count = host_cpus`, so
with no `limits.cpu` it evaluated `min(host_cpus, 0)` = **0 CPUs**, contradicting its own
prose two lines below. A MAJOR killed the skill's only worked example —
`-Xlog:gc+heap+coops=info` emits nothing. The validator proposed `=debug`; that was also
wrong, because at `-Xmx40g`, where compressed oops are _disabled_, the tag-set is silent in
exactly the state being detected. Every occurrence is now `-Xlog:gc+init`, which reports
both states at info.

**One disputed finding, resolved by execution.** The validator claimed an explicit
`-XX:+UseCompressedOops` silently caps the heap at ~32 GB. It did not reproduce under
`-Xmx33g`, `-Xmx40g`, `-Xmx100g` or `-Xmx134g`. Arbitration found we had tested different
code paths: the capping branch sits inside `set_heap_size`'s `if
(FLAG_IS_DEFAULT(MaxHeapSize))`, so any explicit `-Xmx` skips it. On the **ergonomic**
path — which is the worked example's own scenario — it is real and measured here:

```
-XX:MaxRAM=128g -XX:MaxRAMPercentage=85                          → MaxHeapSize 116836532224
-XX:MaxRAM=128g -XX:MaxRAMPercentage=85 -XX:+UseCompressedOops   → MaxHeapSize  32178700288
```

108 GB to 30 GB on one flag, with the artefact still reading `MaxRAMPercentage=85`. It is
now the named trap in the example, because it is the only cause invisible to static
inspection.

## Deliverable 3 — JDK 26/27 correction pass

**31 corrections across 25 files in 17 skills.** Only claims that a verified JDK 26/27 fact
had made _false_ were touched; nothing was rebaselined. One row from the research brief
(`jfr-advanced`) was investigated and **dropped as a false positive** — the repository never
made the claim the JDK 26 change would falsify. One correction (`metaspace-internals`,
`UseCompressedClassPointers` deprecated 25 / obsolete 27) was found outside the brief.

Headline items: JEP 534 makes compact object headers the default in JDK 27; JEP 523 makes
G1 the default in _all_ environments, ending the Serial-on-constrained-container rule;
`-XX:LockingMode` obsolete in 26 and removed in 27; `InitiatingHeapOccupancyPercent`
deprecated in 27 and aliased to `G1IHOP`; `jdk.OldObjectSample` unavailable under ZGC from
26; `InitialRAMPercentage`'s default removed in 26. A **negative** result mattered too:
`sun.misc.Unsafe` `deny` did _not_ become the default in JDK 26 as the repository claimed,
and JDK 27 is frozen without it.

Valhalla was corrected everywhere it appeared: JEP 401 and JEP 539 are Integrated for
**JDK 28**, and **JEP 402 is a Draft with no target release** — it had been cited as
scheduled.

## Known limits

- ~~**The container CPU arithmetic has never been executed on Linux**, including the formula
  that carried the BLOCKER.~~ **Closed 2026-08-28** — executed on a real cgroup v2 container
  across Temurin 21.0.12, 25.0.4 and 26.0.2. All fifteen claims held; three corrections were
  applied. See `container-cpu-execution-record.md`.
- **JDK 21 and JDK 26** behavioural claims are source-derived except the container CPU and
  memory arithmetic, executed on 21.0.12 and 26.0.2 on 2026-08-28; elsewhere only 25.0.3 was
  run. JDK 27 claims rest on Closed/Delivered JEPs and the
  `jdk27` branch — GA is 2026-09-15, so nothing was executed on it.
- No citable third-party benchmark exists for unified-logging overhead. The one figure in
  `unified-logging/references/async-and-cost.md` is a single-machine observation, labelled
  as such, with its method stated. No figure is quoted for `TieredStopAtLevel=1` throughput
  loss or `AlwaysPreTouch` cost, because none is published; the effects are described as
  real and unquantified, with the measurement to take named.
- The compact-header percentages in JEP 519/534 carry no hardware, build or configuration
  in the JEPs themselves, and are reproduced only with that caveat attached.

## Residual, non-gating

`unified-logging`: 9 facts duplicated between body and references (they will diverge), a
paraphrased `jcmd help VM.log` block presented as a transcript, an incomplete baseline
example, and conditionally-relevant material in the body. One NIT is a refinement of a
gating fix: the tags-field padding is the widest tag-set written _so far_, not across the
output — one log carried both `[gc     ]` and `[gc          ]`.

`jvm-performance-review`: 6 MINOR, 5 NIT, the most useful being that the numbered workflow
presupposes an artefact and offers no step-0 branch for a request that arrives without one.

## Repository state

234 skills, 234 registry entries, `registry:check` up to date, both packages
`✓ Valid — no issues found`, architecture boundaries OK, and every file this work touched
passes Prettier.

`npm run verify` still fails repo-wide on `format:check`: **17 files belonging to
concurrent work in this tree** (`concurrent-collections-and-synchronizers`,
`java-lambdas-and-functional-interfaces`, `java-streams`, `java-object-contracts`, and
five `docs/skill-validation` briefs) are not Prettier-clean. They were left untouched
deliberately — they are not part of this work.
