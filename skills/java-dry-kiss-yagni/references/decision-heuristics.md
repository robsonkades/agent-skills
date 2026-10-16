# Decision heuristics and false positives

## The knowledge test

For two similar fragments, answer three questions:

1. **Same reason to change?** Enumerate plausible changes (rate, field, channel, regulation).
   Mark which statements must co-change. A stable shared nucleus may exist even when the full
   fragments also contain independently varying policy.
2. **Same owner?** Different teams, aggregates or bounded contexts may diverge legitimately;
   check whether an explicitly shared authority instead governs this rule and its versions.
   Merging implementations can make one owner's release depend on another's.
3. **Is the sameness in the rule or in the shape?** Two methods that both "loop, filter,
   map to `BigDecimal`, sum" share shape; that syntax alone does not justify a helper.
   Shared technical contracts — such as traversal order, precision or resource cleanup —
   can also be knowledge. Inspect the actual semantics and whether an existing library
   already supplies the needed operation.

Merge only the knowledge for which authority, change reason and ownership align. A "no" narrows
the extraction boundary; it does not automatically classify every common statement as incidental.

## Generated representations

When similar Java files may be generated, trace the actual build task/profile, producer version
and inputs that supply the compiled sources. A directory name or `@Generated` marker is a clue,
not proof that the current build regenerates them. Distinguish generated regions from supported
manual extensions, and stale outputs from independently maintained source.

One authoritative schema or template can legitimately produce several representations. If that
already maintains the shared rule, a runtime helper added only to remove emitted text creates
another dependency without removing an independent decision. For an authorized rule change,
edit the authoritative input or generation logic rather than patching output that the next build
will overwrite. Use the existing permitted generation path, inspect its diff and verify the
consumers; repeat generation to check that it does not undo the intended behavior. If the producer
or its active configuration is unavailable, leave that edit point conditional rather than
inventing a generator or declaring the files independent.

This is the representational-duplication distinction discussed by the authors of
[The Pragmatic Programmer](https://media.pragprog.com/titles/tpp20/dry.pdf), not a requirement
to introduce code generation. For Java annotation processors, the Java 17
[Filer contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.compiler/javax/annotation/processing/Filer.html)
describes generated-file creation and replacement;
[`Generated`](https://docs.oracle.com/en/java/javase/17/docs/api/java.compiler/javax/annotation/processing/Generated.html)
marks provenance, not build execution.

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

Confirm with history, requirements and consumers before deleting. A test-only implementation
can justify a deterministic failure seam; a single-use hook may support external plugins or
an approved migration. Conversely, two callers can share a wrong abstraction. Counts and
commit timing prompt investigation; they do not settle whether the contract earns its cost.

## The cost model

An abstraction is a dependency arrow from every caller. Its price:

- **Change amplification.** Editing shared code now requires understanding every caller;
  the cheapest change (edit one copy) is no longer available.
- **Coupled release.** Callers in the same deployment receive the change together; separately
  deployed library consumers may instead run different versions and need compatibility checks.
- **Indirection.** Readers must leave the call site to learn what happens — acceptable
  when the name fully summarises the behaviour, costly when it does not.

Duplication's price is divergent decisions: a fix applied N−1 times. That failure may be silent
(authorization, rounding, protocol skew), while a wrong abstraction may fail through coupled
releases and caller-specific branches. Compare detectability, impact and rollback for this
system rather than assuming either failure is visible.

## YAGNI: preparation versus premature implementation

Compare building now with adding the capability when needed. Identify the requirement's
owner, expected use date and implementation lead time; a roadmap entry alone does not prove
that work must start now. Include present delivery delay, ongoing complexity and later
migration cost. Sketch the later change to test claims that it will be prohibitively hard.

Prefer a local implementation when later extraction is cheap. Retain the smallest seam when
a current test, integration or committed rollout already needs it; that does not justify a
general plugin framework. A change that would later break published consumers or persisted
data needs compatibility analysis before treating delay as cheap.

For example, one storage provider and a possible future second provider do not establish a
need for plugin discovery. If another team must integrate against an agreed provider contract
now, an interface may already serve a current consumer. The deciding condition is current
use and migration cost, not the number of implementations.

[Fowler's Yagni discussion](https://martinfowler.com/bliki/Yagni.html) explains delay/carrying
costs and why maintaining changeability is compatible with YAGNI; it does not establish the
costs or schedule of a particular project.

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
  risks caller-specific branches when they diverge.
- **Mapping layers.** A DTO, an entity and a domain type with the same fields can preserve
  independently governed wire, schema and domain contracts; sharing a class may couple them.
  Check that independence instead of inferring it from layer names. A shared descriptor may
  derive common structure while each layer retains its own policy; preserve that distinction.
- **Required boilerplate.** Delegation forwarders, `equals`/`hashCode`, exhaustive
  `switch` arms restating variant names — the language imposes these; removing them via
  inheritance or reflection trades visible repetition for hidden coupling.

## When not to apply the tolerance for duplication

Some decisions need one authoritative definition from the first repetition: monetary rounding,
tax/fee policy, authorization policy, protocol/schema constants. Enforcement may still occur at
multiple trust boundaries and should share conformance/contract tests. Input validation and
output encoding are not one generic rule: canonical domain constraints can be authoritative,
while sink-specific controls remain deliberately local. Merge the authority, not every guard.
