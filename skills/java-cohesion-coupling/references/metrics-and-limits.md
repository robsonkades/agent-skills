# Metrics and their limits

## The numbers

For a package P, over production code only:

- **Afferent coupling (Ca)** — packages that depend on P. High Ca means P's externally observed
  contract is load-bearing; a compatible internal change need not fan out.
- **Efferent coupling (Ce)** — packages P depends on. High Ce exposes P to more upstream contract
  changes, but says nothing about edge quality, optionality or actual volatility.
- **Instability** — `I = Ce / (Ca + Ce)`, from 0 (only depended on) to 1 (only depending).
  It is a structural responsibility indicator, not a probability of change or proof that a
  package is safe/unsafe to edit.

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
- **Direction of change.** Metrics are a snapshot. Low change frequency reduces expected
  migration payoff but does not erase latent security, compatibility or integrity risk. Use
  history, ownership and incident evidence alongside the graph.
- **Quality of the dependency.** Depending on a stable, well-named contract and
  depending on a mutable static both add one to Ce. The taxonomy distinguishes
  them; the number cannot.

Consequence: a metric may open an investigation and may corroborate a finding
written from the graph and the change history. A finding whose only evidence is a
threshold ("instability must stay under 0.8") should be rejected in review.

## When not to apply this skill

- **Small codebases and single teams.** A full metric program may not repay its cost, but package
  cycles and boundary leaks can still matter for tests, native images or future extraction. Use
  the lightest graph that answers the decision.
- **Code that does not change.** Restructuring a stable module trades real risk
  (every move can break reflective access, serialised names, framework scanning,
  build scripts) for a benefit that only materialises at the next change — which
  may never come.
- **Prototypes and spikes.** Structure is speculation until the requirements
  stop moving; the cheapest structure to change is the one you have not built.
- **Mid-migration.** Transitional edges distort trend comparisons, but measuring during the
  crossing is how you detect forbidden backflow and know whether the old graph is shrinking.
  Label transition edges and compare against explicit migration milestones.
- **To settle taste disputes.** Two package layouts with equal change behaviour
  are equal; do not deploy metrics as authority where evidence of change pain
  does not exist.

Restructuring churn is itself a cost centre: every package move is a breaking
change for something (imports at minimum; often config, persistence mappings and
serialisation). Batch moves behind release boundaries, and prefer stopping new
bad edges — an architecture test or a module boundary — over relocating old ones
that no longer hurt.
