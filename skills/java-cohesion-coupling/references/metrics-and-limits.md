# Metrics and their limits

## The numbers

For a package P, over production code only:

Here Ca/Ce count distinct external packages, excluding self-edges; some tools count
classes instead. Record the tool, graph scope and counting convention before comparisons.

- **Afferent coupling (Ca)** — packages that depend on P. High Ca means P's externally observed
  contract is load-bearing; a compatible internal change need not fan out.
- **Efferent coupling (Ce)** — packages P depends on. High Ce exposes P to more upstream contract
  changes, but says nothing about edge quality, optionality or actual volatility.
- **Instability** — `I = Ce / (Ca + Ce)`, from 0 (only depended on) to 1 (only depending).
  It is a structural responsibility indicator, not a probability of change or proof that a
  package is safe/unsafe to edit. If Ca + Ce is zero, I is undefined (report N/A),
  not evidence of maximal stability.

The one structural rule worth checking: **depend in the direction of decreasing
instability**. An edge from a low-I package to a high-I package points against this
structural preference; the target may nevertheless be mature and rarely change. Establish
contract exposure and actual history before predicting downstream churn. That edge is a candidate
for the moves in `dependency-graphs.md`.

Application/wiring packages often have more outgoing edges; widely reused contracts often have
more incoming ones. These are contextual observations, not required values for a role.
A domain package may legitimately depend on several other contracts; its name does not require
I = 0. Neither endpoint nor an intermediate value establishes a problem.

## What the metrics cannot see

Cite a metric only alongside what it is blind to:

- **Semantic coupling.** Two packages sharing a database table, a queue name, a
  string constant or a wire format are tightly coupled with zero graph edges.
  The graph measures compile-time knowledge, not agreement that must be kept.
- **Runtime coupling.** Reflection, `ServiceLoader`, DI wiring and event topics
  can introduce edges absent from bytecode analysis; static references to their APIs may
  appear without revealing the dynamically selected implementation or topic contract.
- **Source detail absent from bytecode.** Source-only annotations can disappear; inlined field
  uses are erased even if the declaring class still appears in the graph. Neither view alone
  describes all source compatibility or old-client value dependencies.
- **Edge weight.** Ce counts a package once whether one class touches one method
  or fifty classes touch its internals. Always drop to `-verbose:class -filter:none` before
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
- **Stable code with only speculative maintenance benefit.** Package moves can break
  reflective access, serialised names, framework scanning or build scripts. When the only
  benefit is cheaper future edits, low change frequency can make migration unjustified.
  Existing failure costs or an explicit preventive boundary policy can still justify a
  focused correction; state that objective and weigh the migration risk separately.
- **Prototypes and spikes.** Structure is speculation until the requirements
  stop moving; the cheapest structure to change is the one you have not built.
- **Mid-migration.** Transitional edges distort trend comparisons, but measuring during the
  crossing is how you detect forbidden backflow and know whether the old graph is shrinking.
  Label transition edges and compare against explicit migration milestones.
- **To settle taste disputes.** If layouts meet the same change, ownership and boundary requirements,
  metrics alone do not justify preferring one. An explicit preventive policy may still justify a
  correction without historical change pain.

Restructuring churn is itself a cost centre: package moves can affect imports, supported public
names, configuration, persistence mappings and serialization. Internal source changes are not
automatically public compatibility breaks; inspect the affected consumers. Plan consequential
moves against the actual release contract, and compare preventing new bad edges through an
architecture test or module boundary with relocating existing ones that no longer hurt.
