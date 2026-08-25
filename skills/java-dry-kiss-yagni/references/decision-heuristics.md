# Decision heuristics and false positives

## The knowledge test

For two similar fragments, answer three questions:

1. **Same reason to change?** Enumerate the plausible changes (rate change, new field, new
   channel, new regulation). For each: would both copies change? Knowledge duplication
   changes together for _every_ item on the list, not just some.
2. **Same owner?** If different teams, aggregates or bounded contexts own the copies, they
   will diverge legitimately. Merging them makes one owner's release depend on another's.
3. **Is the sameness in the rule or in the shape?** Two methods that both "loop, filter,
   map to `BigDecimal`, sum" share shape. Shape is free to duplicate; the standard library
   already abstracts it. Only the domain rule inside the shape can be knowledge.

Only merge when all three answers point the same way. One "no" means the resemblance is
incidental.

## Detection heuristics

**Knowledge duplication, worth merging:**

- A bug or rule change was applied to one copy and missed in another — check the git
  history of both files for commits that touched only one.
- A comment says "keep in sync with", or the same literal (a rate, a threshold, a format
  string with meaning) appears in several classes.
- The same validation or rounding rule is re-implemented at each layer boundary.

**The wrong abstraction, worth inlining:**

- The shared method takes boolean or enum parameters that callers use to select behaviour.
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

Duplication's price is the risk of divergence: a fix applied N−1 times. The comparison is
asymmetric in one way that decides close calls: duplication fails visibly (a missed copy
shows up as a wrong result in one place), while a wrong abstraction fails structurally
(every caller slowly bends around it). Prefer the failure you can see.

## False positives — looks like a violation, is correct

- **Test code.** Tests optimise for being readable in isolation and failing independently.
  Repeating three lines of arrangement in ten tests is usually better than a shared
  fixture that couples them; when a scenario needs a paragraph of setup, share a _builder_
  (which names data), not an _assertion helper_ (which hides the behaviour under test).
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

Some knowledge must never have two homes, whatever the rule of three says: monetary
rounding, tax and fee rules, security checks (authorisation, input sanitisation),
protocol and format constants. A divergent copy of these is an incident, not a code
smell. Merge on the second occurrence and pin the single home with a test.
