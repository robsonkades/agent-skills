# Removing a pattern safely

Deleting an abstraction is a refactoring with the same risk profile as adding one. The steps below
keep each change reviewable and reversible.

## Before touching anything

1. **State what it was for, and why that no longer holds.** If you cannot say what force it
   resolved, inspect callers, contracts and git history first. `git log -S` can locate changes in
   occurrences, but may not recover intent. Ask a focused question only if material intent remains unknown.
2. **Check it is yours to remove.** Framework-required abstractions (a `@Transactional` proxy, a
   servlet filter, a JPA lazy proxy, a `ServiceLoader` provider) need preserved runtime behavior and
   a supported replacement; they cannot be removed merely because static references are absent.
3. **Check characterization coverage** through the abstraction at a level that survives removal.
   Reuse existing tests and add focused cases for material uncovered behavior; do not add tests
   merely to assert that a forwarding class existed.
4. **Check the blast radius.** Use `rg` for the type name across the repository, and inspect other
   repositories if it is published. A removal that changes a published API is a different, larger
   decision.

## The general procedure

```text
1. Inventory the surface     include overrides, framework proxies, reflection,
                             serialization, service registrations and external clients.
                             Restrict access/finality only after compatibility assessment.

2. Narrow the interface      migrate genuinely unused contract surface. This
                             often makes the abstraction obviously
                             unnecessary, or obviously justified.

3. Inline at the leaves      convert call sites one at a time, starting
                             with those that already receive their
                             collaborators. Each converted caller is
                             independently mergeable.

4. Move construction up      once most callers take the concrete type,
                             construct it at the composition root.

5. Delete the abstraction    after source, runtime wiring and external-consumer checks;
                             compilation proves only the checked source closure.
```

Mark the migration boundary so new callers do not perpetuate the old surface; retain a compatibility
shim when external consumers still need it.

## Per-pattern removals

**Speculative interface.** For an internal source closure, migrate callers to the implementation
and remove the interface after checks. Replacing an interface with a same-named class is not binary
compatible; implements clauses, proxies, reflection and published clients can break. Keep justified
ports/policy seams and use a compatible migration for public APIs.

**Class-per-constant strategies.** Introduce the configuration type and have every strategy read
from it — behaviour unchanged. Then replace the strategy lookup with a value lookup. Then delete
the classes. Validate each step's lookup, identity and configuration behavior; merge only if authorized.

**Singleton.** The five-step migration in `gof-singleton`: add a constructor taking the
collaborators, introduce a narrow interface, convert callers leaf-first, move construction to the
composition root, delete `getInstance()` last. Do not add a `setInstance()` for tests — it creates
a production API for mutating global state.

**Template Method hierarchy.** Inventory subclasses and required overrides first, introduce a
`Steps` interface with an adapter, move the template into a class with explicit extension policy
taking `Steps`, convert subclasses one at a time, delete the base
(`gof-template-method`).

**Mediator god object.** Extract the parts that are not coordination first — they usually become
plain listeners or direct calls. Then split what remains by
protocol. Do not split by noun (`gof-mediator`).

**Decorator stack.** Do not remove layers; document the order, add a composition test, and only
then consider collapsing the fixed part into one class. A stack that is hard to read is not
necessarily wrong (`gof-decorator`).

**Factory for a constructor.** Consider inlining after checking naming, visibility, lifecycle,
validation, caching, exception behavior, method references and external contracts. Review the IDE diff
and test relevant behavior; the tool does not prove semantic compatibility.

## Ordering rules for a large removal

- **Leaves before roots.** A caller that already receives its collaborators is the cheapest to
  convert and creates no new coupling.
- **Tests before production.** Converting a test to construct the concrete type directly proves the
  type is usable without the abstraction.
- **Coherent reviewable steps.** Related small removals can stay together; split when ownership,
  behavior or validation becomes hard to assess.
- **Prepare each step for integration.** Commit or merge only with existing user authorization.
- **Make behavior changes explicit.** Keep refactoring and bug fixes distinguishable in review;
  use separate changes when that improves validation and rollback, without implying commit permission.

## Measuring whether it helped

State the expected effect before starting, then check it:

```text
Types removed              a count, not a feeling
Call-site readability      can a reader now see what runs, without
                           opening the wiring?
Test setup                 mocks per test, before and after
Change locality            does the next feature touch fewer files?
```

If none of these improved, the abstraction may have been earning its place and the removal should
be reverted. That is a legitimate outcome and worth recording, so the next person does not repeat
the attempt.

## The four cases to leave alone

1. **A working hierarchy with no demonstrated maintenance or runtime cost.** Lack of bugs or an
   arbitrary age alone does not establish value; compare migration cost with evidence.
2. **A port over an external dependency.** One implementation is fine; it bounds a foreign model
   and gives tests a seam.
3. **Required framework behavior without a validated replacement.** Proxies, filters, template
   classes and ServiceLoader providers may be removed only while preserving the needed contract.
4. **An abstraction whose second implementation is scheduled and specified.** Not speculative —
   about to be true.

Where a present force justifies retention, record the reason when it is not apparent; a comment is
not a substitute for checking whether the force still holds.

Source: [JLS 17 binary compatibility](https://docs.oracle.com/javase/specs/jls/se17/html/jls-13.html),
especially final classes/methods, access changes and interface evolution.
