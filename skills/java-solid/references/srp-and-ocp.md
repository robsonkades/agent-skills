# SRP and OCP: detection, false positives, limits

## Single responsibility

A responsibility is a reason to change, and the only reliable witness is change
itself. Review the history before the shape.

### Detection heuristics

- **Divergent change in the log.** `git log --follow --oneline` on the class shows
  interleaved commits serving unrelated pressures — rate rules in one, file formats
  in another, retry behaviour in a third. Strongest signal available.
- **Disjoint field/method clusters.** One group of methods touches one group of
  fields, another group touches another, and nothing crosses. The class is two
  classes sharing a name. (The vocabulary for this is cohesion — see
  java-cohesion-coupling.)
- **A constructor mixing unrelated mechanisms.** A parameter list holding a price
  table, an SMTP client and a template engine says the class answers to at least
  the pricing team, the ops team and the design team.
- **The purpose sentence needs "and".** If the honest one-line description is
  "computes duty _and_ renders the declaration", the "and" is the seam.
- **Stakeholder test.** List who requests changes to this class. Two independent
  requesters with veto over different parts is two reasons to change.

### False positives — do not flag

- **Many methods, one reason.** A `Money` type with twenty arithmetic and
  formatting operations changes only when monetary arithmetic changes. Size is not
  responsibility count.
- **A facade.** Its single responsibility _is_ aggregating a subsystem behind one
  surface. Many dependencies, one reason to change: the subsystem's shape.
- **A mapper or serialiser touching every field.** It changes whenever the mapped
  type changes — that is one tracking reason, not one reason per field.
- **A class that has never changed.** Whatever its shape, zero observed change
  streams means zero evidence. Note the shape if you must; do not demand a split.

### When not to apply

Splitting has a price: two files, a seam to name, wiring, and every future reader
reassembling the whole. Do not split stable code, code whose halves always change
together, or code where the split boundary would need to pass fifteen values
across it. Over-splitting has a name — shotgun surgery: one logical change now
fans out across many classes. SRP applied without change evidence manufactures it.

## Open-closed

OCP says new behaviour should arrive as new code, not edits to working code. The
part reviews forget: an extension point is speculation until the second variant
exists, and it costs indirection, API surface and comprehension from day one.

### Detection heuristics

- **The recurring conditional.** The same `if`/`switch` over a type code or string
  tag edited in commit after commit, each adding a branch for a new feature. That
  is _observed_ variation — the legitimate OCP trigger. The fix is a polymorphic
  seam: an interface per variant behaviour, or a sealed hierarchy when the variant
  set is closed and owned by you.
- **Modification hotspots in stable code.** A mature class that keeps being edited
  for reasons that look like "one more case" — check whether every edit adds a
  parallel branch.
- **Copy-paste variants.** Three near-identical classes differing in one method
  body. Variation arrived; nobody built the point for it.

### False positives — do not flag

- **A switch over a sealed type.** Exhaustive pattern switches over a sealed
  hierarchy — no `default` — are the designed alternative to OCP: the author chose
  "compiler tells me every place a new variant must be handled" over "new variants
  slot in silently". Recommending a visitor or a strategy here removes that
  guarantee.
- **An enum switch with all constants covered.** Same trade, older tool.
- **A conditional edited once.** One edit is not a pattern. Two may be coincidence.
  Flag on the third, when variation is demonstrated.
- **Branching on data, not type.** A threshold check (`amount > limit`) is domain
  logic, not a missing extension point.

### When not to apply

An abstraction in a _published_ API is close to permanent — you cannot un-ship an
extension point once external code implements it, so speculative OCP in a public
surface is the most expensive kind. Inside an application, prefer the cheapest
correct thing: edit the switch. Sealed-plus-switch beats an open hierarchy
whenever you own all the variants and want exhaustiveness; an open interface beats
sealed when third parties must add variants without touching your code. Choosing
between them is a design decision, and neither choice is a SOLID violation.
