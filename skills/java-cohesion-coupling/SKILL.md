---
name: java-cohesion-coupling
description: >
  Cohesion and coupling in Java at class, package and module level: cohesion types
  (functional, communicational, temporal, logical), coupling types in real code,
  afferent/efferent coupling and instability, package dependency graphs, and JPMS module
  boundaries as enforced coupling limits. Use when a small change fans out across packages,
  when a package cycle appears, when deciding which package or module a class belongs in, or
  when reviewing package architecture. Principle framing lives in java-solid; inverting a
  specific dependency edge in java-dependency-inversion.
---

# Java Cohesion and Coupling

## Purpose

Coupling decides the blast radius of a change; cohesion decides whether a package
is one thing or several sharing a directory. This skill turns both into package-level
review work on the _real_ dependency graph. The failure modes it exists to prevent:
restructuring packages by aesthetics or by metric thresholds, and filing findings
from numbers with no observed change pain behind them.

## Workflow

Inspect compiler release/toolchains, resolved dependencies, production artifacts, module
descriptors and supported launch configuration first. No single authoring baseline is
declared; tool references use JDK 25, JPMS requires Java 9+, and the example's `List.copyOf`
requires Java 10+. Use a compatible analyzer and the project's target versions; do not
introduce modules, upgrade Java or add tools as an incidental cleanup.

1. **Build the real graph.** `jdeps -verbose:class -filter:none` over the compiled classes, plus
   the `requires` edges under JPMS. Bytecode references are the compile/link graph;
   imports can be unused and miss reflection, services, resources, schemas and shared
   infrastructure. The architecture diagram remains a hypothesis, and runtime/semantic
   edges need separate evidence.
2. **Find strongly connected components first.** A package cycle prevents a simple clean
   topological build without prebuilt peers and can increase reasoning/migration cost,
   but does not prove lockstep releases or changes. Treat the component as one candidate, identify its actual edges, and
   break it when the benefit exceeds compatibility and ownership costs.
3. **Classify the suspicious edges.** What kind of coupling does each carry —
   content, common, control, stamp, data? The kind determines the fix.
4. **Choose among the three moves** for each bad edge: move a misplaced class, invert the edge
   (that mechanic is the java-dependency-inversion skill), or merge packages that always change
   together and were never independently releasable concepts. Edge count alone does not choose.
5. **Corroborate with metrics.** Afferent/efferent
   counts and instability support a case built from the graph and the change
   history; a metric can direct investigation but cannot establish a defect by itself.
6. **Verify.** Recompute static and declared graphs, exercise runtime/service-loading paths, and
   confirm the motivating change or policy is easier to enforce. Inversion may add an interface
   edge while removing the harmful concrete edge, so "fewer packages" is not the universal test.

## Rules

- Depend in the direction of stability. The most expensive edge in a graph runs
  from a widely-depended-on contract into a structurally unstable package. Martin's
  instability metric describes dependency shape, not empirical volatility; corroborate it
  with change history and contract compatibility before calling the target volatile.
- Common closure is stronger evidence than conceptual similarity, but balance it with reuse,
  ownership, release and dependency direction. Classes that merely share a noun do not
  automatically belong together — `util`, `common` and `helpers` often group by category and
  accrete dependants from everywhere.
- A package's exported surface is its coupling budget. Under JPMS, an unexported
  package is not accessible to ordinary code in other modules. `exports`, qualified exports,
  `opens`, services, reflection flags and command-line `--add-exports/--add-opens` create
  distinct edges, so unexported is strong encapsulation under the supported launch contract,
  not metaphysical isolation. The module system rejects cyclic `requires`.
- Temporal cohesion in lifecycle code — init, shutdown, migration ordering — is
  unavoidable and not a finding. Flag it only when unrelated business logic hides
  inside the lifecycle sequence.
- A stateless leaf utility can be highly cohesive (`Hex`, one numerical transform) or a logical
  junk drawer. Judge whether its functions change for one reason. It becomes suspicious when
  unrelated domain vocabulary, mutable state or dependencies accumulate.
- Metrics are evidence, never verdicts. A threshold ("Ce is too high") can open an
  investigation; a finding needs a violated boundary, credible failure/change cost, or an
  explicit preventive architecture objective.

## References

For each finding, report the actual edge and artifact/command that exposes it, observed
change cost or violated policy, proposed move and compatibility checks. If compiled artifacts,
dependencies or history are unavailable, label the graph incomplete and the migration benefit
conditional; do not claim an absent edge or measured improvement from source inspection alone.

- [Coupling and cohesion taxonomy](references/taxonomy.md) — each type translated
  to what it looks like in Java, with detection heuristics and false positives.
  Read when classifying an edge or judging a package.
- [Reading the dependency graph](references/dependency-graphs.md) — cycle-breaking
  and edge selection, with a worked package-level example. Read when working a
  real graph.
- [Metrics and their limits](references/metrics-and-limits.md) — Ca, Ce,
  instability, what they can and cannot see, and when not to apply this skill at
  all. Read before citing any metric in a finding.
