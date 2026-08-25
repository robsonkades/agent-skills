---
name: java-cohesion-coupling
description: >
  Cohesion and coupling in Java at class, package and module level: cohesion types
  (functional, communicational, temporal, logical), coupling types in real code,
  afferent/efferent coupling and instability, package dependency graphs, and JPMS
  module boundaries as enforced coupling limits. Use when a small change fans out
  across packages, when a package cycle appears, when deciding which package or
  module a class belongs in, or when reviewing package architecture. Principle
  framing lives in java-solid; inverting a specific dependency edge in
  java-dependency-inversion.
---

# Java Cohesion and Coupling

## Purpose

Coupling decides the blast radius of a change; cohesion decides whether a package
is one thing or several sharing a directory. This skill turns both into package-level
review work on the _real_ dependency graph. The failure modes it exists to prevent:
restructuring packages by aesthetics or by metric thresholds, and filing findings
from numbers with no observed change pain behind them.

## Workflow

1. **Build the real graph.** `jdeps -verbose:class` over the compiled classes, or
   the `requires` edges under JPMS. Import statements are ground truth; the
   architecture diagram is a hypothesis to test against them.
2. **Find cycles first.** Every package in a cycle compiles, changes and is
   understood as one unit — the packages are a fiction. A cycle is one finding,
   not one per member, and breaking it precedes any other restructuring.
3. **Classify the suspicious edges.** What kind of coupling does each carry —
   content, common, control, stamp, data? The kind determines the fix.
4. **Choose among the three moves** for each bad edge: move a class (most bad
   edges exist because one class sits in the wrong package), invert the edge
   (that mechanic is the java-dependency-inversion skill), or merge packages that
   always change together and were never really two.
5. **Corroborate with metrics after suspicion, never before.** Afferent/efferent
   counts and instability support a case built from the graph and the change
   history; they never originate one.
6. **Verify.** Recompute the graph: the edge is gone, no new cycle appeared, and
   the change that motivated the work now touches fewer packages.

## Rules

- Depend in the direction of stability. The most expensive edge in a graph runs
  from a widely-depended-on package into a volatile one: every change to the
  volatile package now reverberates through the stable one's dependants.
- Common closure beats conceptual similarity: classes that change together belong
  together. Classes that merely share a noun do not — `util`, `common` and
  `helpers` packages are logical cohesion, grouping by category instead of by
  change, and they accrete dependants from everywhere.
- A package's exported surface is its coupling budget. Under JPMS, an unexported
  package cannot be coupled to from outside — the strongest decoupling Java
  offers is not creating the possibility. The module system also rejects cyclic
  `requires`, so module boundaries make the no-cycles rule physical.
- Temporal cohesion in lifecycle code — init, shutdown, migration ordering — is
  unavoidable and not a finding. Flag it only when unrelated business logic hides
  inside the lifecycle sequence.
- A stateless leaf utility class is low cohesion by definition and often fine. It
  becomes a finding when it acquires state, domain vocabulary, or dependencies —
  at that point it is a domain concept without a home.
- Metrics are evidence, never verdicts. A finding built on a threshold ("Ce is
  too high") with no observed change pain is not a finding.

## References

- [Coupling and cohesion taxonomy](references/taxonomy.md) — each type translated
  to what it looks like in Java, with detection heuristics and false positives.
  Read when classifying an edge or judging a package.
- [Reading the dependency graph](references/dependency-graphs.md) — cycle-breaking
  and edge selection, with a worked package-level example. Read when working a
  real graph.
- [Metrics and their limits](references/metrics-and-limits.md) — Ca, Ce,
  instability, what they can and cannot see, and when not to apply this skill at
  all. Read before citing any metric in a finding.
