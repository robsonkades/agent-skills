# SRP and OCP: detection, false positives, limits

## Single responsibility

A responsibility is a reason to change owned by an actor or authority. History is the strongest
witness in mature code; accepted requirements, team/release boundaries and external contracts are
needed for new code. Review those before shape.

### SRP detection heuristics

- **Divergent change in the log.** `git log --follow --oneline` on the class shows
  interleaved commits serving unrelated pressures — rate rules in one, file formats
  in another, retry behaviour in a third. Strongest signal available.
- **Disjoint field/method clusters.** One group of methods touches one group of
  fields, another group touches another, and nothing crosses. Investigate whether these
  clusters serve independent authorities or one coherent role. (The vocabulary is cohesion — see
  java-cohesion-coupling.)
- **A constructor mixing mechanisms.** A price table, SMTP client and template engine suggest
  distinct pressures; establish the actual authorities before inferring responsibility count.
- **The purpose sentence needs "and".** If the honest one-line description is
  "computes duty _and_ renders the declaration", inspect the two change contracts;
  the conjunction alone does not prove a useful seam.
- **Stakeholder test.** List who requests changes to this class. Two independent
  requesters with veto over different parts is two reasons to change.

### SRP false positives — do not flag

- **Many methods, one reason.** A `Money` type with twenty coherent arithmetic operations may
  have one authority. Presentation formatting can change independently, so inspect that
  contract rather than assuming every method on a value type has the same responsibility.
- **A facade.** Its single responsibility _is_ aggregating a subsystem behind one
  surface. Many dependencies, one reason to change: the subsystem's shape.
- **A mapper or serialiser touching every field.** It changes whenever the mapped
  type changes — that is one tracking reason, not one reason per field.
- **A class with no history and no independent ownership/requirement pressure.** Shape alone does
  not justify a split. Do not confuse this with critical new code whose specification already
  names independently governed concerns.

### When not to apply SRP splitting

Splitting has a price: two files, a seam to name, wiring, and every future reader
reassembling the whole. Stable code whose parts change together usually benefits from
staying together unless an accepted ownership or consumer constraint requires a boundary.
A seam passing much shared state is a reason to reconsider that boundary, not a numeric ban.
Over-splitting has a name — shotgun surgery: one logical change now
fans out across many classes. SRP applied without change evidence manufactures it.

## Open-closed

OCP says new behaviour should often arrive as new code rather than risky edits to stable code.
The part reviews forget: an extension point without an observed variant or committed extension
contract is speculation, and it costs indirection, API surface and comprehension from day one.

### OCP detection heuristics

- **The recurring conditional.** The same `if`/`switch` over a type code or string
  tag edited in commit after commit, each adding a branch for a new feature. That
  is _observed_ variation, not proof that dispatch is costly. Compare keeping the switch
  with a small function/strategy seam or shared role interface when independent extension
  is required. A sealed family suits an owned variant set when its coverage trade-off helps.
- **Modification hotspots in stable code.** A mature class that keeps being edited
  for reasons that look like "one more case" — check whether every edit adds a
  parallel branch.
- **Copy-paste variants.** Three near-identical classes differing in one method
  body. Variation arrived; nobody built the point for it.

### OCP false positives — do not flag

- **A switch over a sealed type.** Explicit variant coverage can deliberately require
  reviewing newly uncovered cases on recompilation. A root type-pattern arm or an arm
  covering a non-sealed branch can accept later variants without a literal `default`.
  A required visitor method can also force source implementations to handle new variants;
  judge actual coverage, fallback policy and consumers rather than pattern names.
- **An exhaustive enum switch expression.** Uncovered constants require a source update
  when recompiled. A classic enum switch statement need not be exhaustive; merely listing
  today's constants does not create the same compiler guard.
- **A conditional edited once.** One edit is weak historical evidence. Do not wait mechanically
  for a third when a published extension requirement or high-cost second variant already makes
  the axis explicit.
- **Branching on data, not type.** A threshold check (`amount > limit`) is domain
  logic, not a missing extension point.

### When not to apply OCP abstraction

An abstraction in a _published_ API is close to permanent — you cannot un-ship an
extension point once external code implements it, so speculative OCP in a public
surface is the most expensive kind. Inside an application, prefer the cheapest
correct thing, which may be editing the switch. Sealed-plus-switch can fit owned variants
and coverage needs; ordinary polymorphism can still suit their operation/lifecycle contracts.
An open interface permits third parties to add variants without modifying a closed permits list. Choosing
between them is a design decision, and neither choice is a SOLID violation.

See [JLS 21 switch coverage and statement rules](https://docs.oracle.com/javase/specs/jls/se21/html/jls-14.html#jls-14.11.1.1)
and [separate binary evolution](https://docs.oracle.com/javase/specs/jls/se21/html/jls-13.html#jls-13.5.2).
Old consumers are not rechecked at link time; a previously exhaustive switch can throw
`MatchException` on a new unmatched variant.
