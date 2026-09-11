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

**Class-per-constant strategies.** If a value representation is justified, introduce a table/enum
or validated configuration behind the existing strategies, then migrate the lookup and remove
classes when compatible. Check required identity, metadata, defaults and change controls; introducing
reloadable configuration is a separate behavior/operational choice. Validate each step.

**Singleton.** Use the ownership migration in `gof-singleton` when global access is the problem:
expose collaborators, inject the existing instance first and coordinate ownership/cutover before
constructing a replacement. A narrow interface is useful only when it supplies a consumer boundary;
constructor injection alone may suffice. Retain compatible legacy access for its support window;
do not add a `setInstance()` that creates a new production global-mutation contract.

**Template Method hierarchy.** Inventory subclasses and required overrides first. When composition
is justified, one migration uses a `Steps` interface/adapter and a class with explicit extension
policy, then converts subclasses before removing the base. Retain an adequate existing extension contract
(`gof-template-method`).

**Mediator god object.** Split demonstrated unrelated protocol/state ownership, preserving required
caller methods and transition authority. Non-coordination responsibilities may become listeners or
direct calls; nouns and participant counts alone do not determine the split (`gof-mediator`).

**Decorator stack.** Establish actual ordering and lifecycle from wiring/contracts and existing
tests. Retain required layers; remove or consolidate only a demonstrated unnecessary cost with
equivalent composed behavior. Fixed order alone does not justify collapse (`gof-decorator`).

**Factory for a constructor.** Consider inlining after checking naming, visibility, lifecycle,
validation, caching, exception behavior, method references and external contracts. Review the IDE diff
and test relevant behavior; the tool does not prove semantic compatibility.

## Ordering rules for a large removal

- **Leaves before roots.** A caller that already receives its collaborators is often cheaper to
  convert; replacing an interface dependency with a concrete type still needs a boundary/coupling check.
- **Preserve consumer-level checks.** A test constructing the concrete type proves only that tested
  path works; keep checks of public contracts and runtime wiring that the migration could break.
- **Coherent reviewable steps.** Related small removals can stay together; split when ownership,
  behavior or validation becomes hard to assess.
- **Prepare each step for integration.** Commit or merge only with existing user authorization.
- **Make behavior changes explicit.** Keep refactoring and bug fixes distinguishable in review;
  use separate changes when that improves validation and rollback, without implying commit permission.

## Measuring whether it helped

State the expected consumer, correctness or maintenance outcome before starting, then check it.
Choose supporting measures relevant to that outcome; these are diagnostics, not success quotas:

```text
Contract preserved         ordinary, advanced and failure uses remain valid
Targeted cost removed      observed ownership/change/runtime problem is resolved
Types removed              a structural count, not proof of benefit
Call-site readability      can a reader now see what runs, without
                           opening the wiring?
Test setup                 mocks per test, before and after
Change locality            does the next feature touch fewer files?
```

If the intended outcome is unsupported or costs/regressions outweigh it, reconsider or revert the
removal within the authorized scope. Unchanged class/mock counts alone do not invalidate a contract
improvement. Record the decision and any unresolved evidence so later work does not repeat it blindly.

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
