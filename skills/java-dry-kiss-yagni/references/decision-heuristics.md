# Decision heuristics and false positives

## The knowledge test

For two similar fragments, answer three questions:

1. **Same reason to change?** Enumerate plausible changes (rate, field, channel, regulation).
   Mark which statements must co-change. A stable shared nucleus may exist even when the full
   fragments also contain independently varying policy.
2. **Same owner?** If different teams, aggregates or bounded contexts own the copies, they
   will diverge legitimately. Merging them makes one owner's release depend on another's.
3. **Is the sameness in the rule or in the shape?** Two methods that both "loop, filter,
   map to `BigDecimal`, sum" share shape. Shape is free to duplicate; the standard library
   already abstracts it. Only the domain rule inside the shape can be knowledge.

Merge only the knowledge for which authority, change reason and ownership align. A "no" narrows
the extraction boundary; it does not automatically classify every common statement as incidental.

## Detection heuristics

**Knowledge duplication, worth merging:**

- A bug or rule change was applied to one copy and missed in another — check the git
  history of both files for commits that touched only one.
- A comment says "keep in sync with", or the same literal (a rate, a threshold, a format
  string with meaning) appears in several classes.
- The same validation or rounding rule is re-implemented at each layer boundary.

**The wrong abstraction, worth inlining:**

- The shared method takes flags whose meaning is caller identity or unrelated behavior, rather
  than an explicit input/policy of one operation.
- Callers pass `null`, empty collections or dummy values for parameters that exist only
  for other callers.
- Each new requirement adds a conditional inside the shared code rather than code at a
  call site — the helper's cyclomatic complexity grows linearly with its caller count.
- Nobody can state what the method does without enumerating its callers.

**Speculative generality, worth deleting:**

- A type parameter instantiated with exactly one type; a strategy with one implementation
  injected in one place; a "pluggable" registry with one entry.
- Configuration that has held the same value in every environment since it was added.
- Abstract methods or hooks that no subclass overrides meaningfully.

Confirm with history before deleting: generality exercised by tests only, or added in the
same commit as its single use, was speculative. Generality with two real users was not.

## The cost model

An abstraction is a dependency arrow from every caller. Its price:

- **Change amplification.** Editing shared code now requires understanding every caller;
  the cheapest change (edit one copy) is no longer available.
- **Coupled release.** All callers get the new behaviour at once, wanted or not.
- **Indirection.** Readers must leave the call site to learn what happens — acceptable
  when the name fully summarises the behaviour, costly when it does not.

Duplication's price is divergent decisions: a fix applied N−1 times. That failure may be silent
(authorization, rounding, protocol skew), while a wrong abstraction may fail through coupled
releases and caller-specific branches. Compare detectability, impact and rollback for this
system rather than assuming either failure is visible.

## False positives — looks like a violation, is correct

- **Test code.** Tests optimise for local readability and independent diagnosis. Repeated setup
  can remain local; builders can name complex data. Domain-specific assertion helpers are useful
  when they improve failure messages and keep the asserted contract visible — avoid helpers that
  hide which behavior the test establishes.
- **Two bounded contexts with similar types.** `Customer` in billing and `Customer` in
  shipping sharing a class is not DRY — it is coupling two models that must evolve
  separately. The duplication is the architectural boundary working.
- **Similar rules with different authorities.** A promotional discount and a regulatory
  rebate may compute the same way today. They change on different triggers; merging them
  guarantees a flag parameter later.
- **Mapping layers.** A DTO, an entity and a domain type with the same five fields are
  three statements of knowledge owned by three contracts (wire, schema, model). The
  repetition is the decoupling.
- **Required boilerplate.** Delegation forwarders, `equals`/`hashCode`, exhaustive
  `switch` arms restating variant names — the language imposes these; removing them via
  inheritance or reflection trades visible repetition for hidden coupling.

## When not to apply the tolerance for duplication

Some decisions need one authoritative definition from the first repetition: monetary rounding,
tax/fee policy, authorization policy, protocol/schema constants. Enforcement may still occur at
multiple trust boundaries and should share conformance/contract tests. Input validation and
output encoding are not one generic rule: canonical domain constraints can be authoritative,
while sink-specific controls remain deliberately local. Merge the authority, not every guard.
