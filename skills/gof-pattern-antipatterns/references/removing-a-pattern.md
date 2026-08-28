# Removing a pattern safely

Deleting an abstraction is a refactoring with the same risk profile as adding one. The steps below
keep each change reviewable and reversible.

## Before touching anything

1. **State what it was for, and why that no longer holds.** If you cannot say what force it
   resolved, you also cannot predict what will break. Ask the author or the git history first —
   `git log -S` on the interface name usually finds the commit that introduced it and the ticket
   that motivated it.
2. **Check it is yours to remove.** Framework-required abstractions (a `@Transactional` proxy, a
   servlet filter, a JPA lazy proxy, a `ServiceLoader` provider) are not.
3. **Put characterisation tests in place** covering the behaviour through the abstraction, at the
   level that will survive its removal. Over-abstracted code is frequently under-tested, and that
   combination is where a de-abstraction becomes an incident.
4. **Check the blast radius.** `grep` for the type name across the repository, and for other
   repositories if it is published. A removal that changes a published API is a different, larger
   decision.

## The general procedure

```text
1. Freeze the surface        make the class final; make members private
                             that need not be protected. Compilation
                             errors here tell you who was relying on
                             what — and are cheap to revert.

2. Narrow the interface      delete methods nobody calls. This alone
                             often makes the abstraction obviously
                             unnecessary, or obviously justified.

3. Inline at the leaves      convert call sites one at a time, starting
                             with those that already receive their
                             collaborators. Each converted caller is
                             independently mergeable.

4. Move construction up      once most callers take the concrete type,
                             construct it at the composition root.

5. Delete the abstraction    last, when the compiler proves nothing
                             refers to it. Not before.
```

Step 5 last is not fussiness: keeping the abstraction "for now" while callers migrate means new
code will use it, and the migration never finishes.

## Per-pattern removals

**Speculative interface.** Rename the implementation to the interface's name in one commit
(callers unchanged if the interface is deleted in the same step), or inline the interface and
delete it. The compiler does the work. Keep the port if the implementation is an external
dependency's adapter.

**Class-per-constant strategies.** Introduce the configuration type and have every strategy read
from it — behaviour unchanged. Then replace the strategy lookup with a value lookup. Then delete
the classes. Three merges, each safe.

**Singleton.** The five-step migration in `gof-singleton`: add a constructor taking the
collaborators, introduce a narrow interface, convert callers leaf-first, move construction to the
composition root, delete `getInstance()` last. Do not add a `setInstance()` for tests — it creates
a production API for mutating global state.

**Template Method hierarchy.** Make the template `final` first (this alone surfaces subclasses that
overrode it), introduce a `Steps` interface with an adapter, move the template into a `final` class
taking `Steps`, convert subclasses one at a time, delete the base
(`gof-template-method`).

**Mediator god object.** Extract the parts that are not coordination first — they usually become
plain listeners or direct calls, and they are a third of the class. Then split what remains by
protocol. Do not split by noun (`gof-mediator`).

**Decorator stack.** Do not remove layers; document the order, add a composition test, and only
then consider collapsing the fixed part into one class. A stack that is hard to read is not
necessarily wrong (`gof-decorator`).

**Factory for a constructor.** Inline it. The IDE does this correctly; the only care needed is that
the factory was not also doing validation or caching that must move.

## Ordering rules for a large removal

- **Leaves before roots.** A caller that already receives its collaborators is the cheapest to
  convert and creates no new coupling.
- **Tests before production.** Converting a test to construct the concrete type directly proves the
  type is usable without the abstraction.
- **One pattern at a time.** Removing a Singleton and a Factory in one change makes the diff
  unreviewable and the bisect useless.
- **Merge each step.** A long-lived branch de-abstracting a core type will conflict with everything.
- **Keep the behaviour identical.** Fixing a bug found during the removal is a separate commit; a
  mixed diff is where reverts become impossible.

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

1. **A working hierarchy that has not caused a bug and has not changed in a year.** The migration
   cost is certain; the benefit is speculative (`java-dry-kiss-yagni`).
2. **A port over an external dependency.** One implementation is fine; it bounds a foreign model
   and gives tests a seam.
3. **Anything the framework requires.** Proxies, filters, template base classes, `ServiceLoader`
   providers.
4. **An abstraction whose second implementation is scheduled and specified.** Not speculative —
   about to be true.

In all four, the useful action is not removal but a comment stating why it exists, so the next
reviewer does not repeat this analysis.
