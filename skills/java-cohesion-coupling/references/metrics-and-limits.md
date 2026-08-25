# Metrics and their limits

## The numbers

For a package P, over production code only:

- **Afferent coupling (Ca)** — packages that depend on P. High Ca means changing
  P is expensive: its contract is load-bearing.
- **Efferent coupling (Ce)** — packages P depends on. High Ce means P is easy to
  break from outside: it has many reasons to be forced to change.
- **Instability** — `I = Ce / (Ca + Ce)`, from 0 (only depended on; hard to
  change safely, easy to depend on) to 1 (only depending; free to change, unsafe
  to depend on).

The one structural rule worth checking: **depend in the direction of decreasing
instability**. An edge from a low-I package to a high-I package means something
stable and widely used is at the mercy of something volatile — the shape behind
"we changed a helper and half the system recompiled". That edge is a candidate
for the moves in `dependency-graphs.md`.

Expected values, not targets: a leaf application/wiring package sits near I = 1
and should; a domain-model package sits near I = 0 and should. Neither number is
a problem — the numbers describe roles.

## What the metrics cannot see

Cite a metric only alongside what it is blind to:

- **Semantic coupling.** Two packages sharing a database table, a queue name, a
  string constant or a wire format are tightly coupled with zero graph edges.
  The graph measures compile-time knowledge, not agreement that must be kept.
- **Runtime coupling.** Reflection, `ServiceLoader`, DI wiring and event topics
  create dependencies `jdeps` never sees.
- **Edge weight.** Ce counts a package once whether one class touches one method
  or fifty classes touch its internals. Always drop to `-verbose:class` before
  judging an edge.
- **Direction of change.** Metrics are a snapshot. A "bad" number on a package
  nobody has touched in two years costs nothing; a "good" number on a package
  with three teams editing it weekly hides the real problem. Weight every number
  by change frequency from the log.
- **Quality of the dependency.** Depending on a stable, well-named contract and
  depending on a mutable static both add one to Ce. The taxonomy distinguishes
  them; the number cannot.

Consequence: a metric may open an investigation and may corroborate a finding
written from the graph and the change history. A finding whose only evidence is a
threshold ("instability must stay under 0.8") should be rejected in review.

## When not to apply this skill

- **Small codebases and single teams.** Package discipline pays where change
  streams and teams collide. A 15-kloc service owned by three people does not
  need instability analysis; it needs clear names.
- **Code that does not change.** Restructuring a stable module trades real risk
  (every move can break reflective access, serialised names, framework scanning,
  build scripts) for a benefit that only materialises at the next change — which
  may never come.
- **Prototypes and spikes.** Structure is speculation until the requirements
  stop moving; the cheapest structure to change is the one you have not built.
- **Mid-migration.** A codebase halfway between two architectures shows terrible
  numbers by construction. Measure at the end state, not during the crossing.
- **To settle taste disputes.** Two package layouts with equal change behaviour
  are equal; do not deploy metrics as authority where evidence of change pain
  does not exist.

Restructuring churn is itself a cost centre: every package move is a breaking
change for something (imports at minimum; often config, persistence mappings and
serialisation). Batch moves behind release boundaries, and prefer stopping new
bad edges — an architecture test or a module boundary — over relocating old ones
that no longer hurt.
