# Deciding on Abstract Factory, and what replaces it

## The family-invariant test

Write the sentence: _"A `<product A>` from family X must never be used with a `<product B>` from
family Y, because \_\_\_."_ If the blank cannot be filled with a concrete failure, there is no
family and the pattern has nothing to protect.

Concrete blanks that pass the test:

- "…because the PDF paginator emits page-break markers the HTML renderer writes out as literal
  text."
- "…because the in-memory unit of work never flushes, so the Postgres repository's version
  checks silently pass."
- "…because the v2 serialiser writes a field the v1 parser rejects as unknown."

Blanks that fail the test — and mean the products should be injected independently:

- "…because it would be inconsistent." (Restates the claim.)
- "…because we always use them together." (Habit, not invariant.)
- "…because the config says so." (Configuration already enforces it.)

## Alternatives, by what they resolve

| Alternative                              | Resolves                                                       | Fails to resolve                                                      |
| ---------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Independent injection of each product    | Wiring, testing, lifecycle                                     | Nothing prevents a mixed set if two families are wired simultaneously |
| One `@Configuration` per profile         | Deployment-time family selection, with mixing impossible       | Selection that varies per request                                     |
| `Map<Key, Family>` where family = record | Runtime selection, family kept atomic, key set visible in code | Third-party contribution; families needing lifecycle                  |
| Sealed `Format` + exhaustive `switch`    | Compile-time proof that every family is handled                | Families contributed by code you do not compile                       |
| `ServiceLoader<FamilyProvider>`          | Third-party families, discovered at runtime                    | Any compile-time guarantee; ordering; classpath surprises             |
| Configuration properties                 | Families that differ only in values                            | Families that differ in behaviour                                     |

The commonest correct answer in a Spring application is **one `@Configuration` per profile** —
and it is not usually recognised as Abstract Factory, because the pattern has been absorbed by
the container. Recognising it is what stops someone adding a redundant factory interface on top.

## Abstract Factory versus its neighbours

| Question                                              | Answer                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| One product, subtype decides the concrete class       | Factory Method                                                |
| One product, many parameters, staged or optional      | Builder                                                       |
| Many products, one family, family varies              | Abstract Factory                                              |
| New object built from an existing instance's state    | Prototype                                                     |
| One instance, global access                           | Singleton (and reconsider)                                    |
| Products unrelated, caller asks for whatever it needs | Service Locator — an anti-pattern here, not a GoF alternative |

Abstract Factory is frequently _built from_ Factory Methods (each `newX()` is one) and
frequently _returns_ Builders. Those are compositions, not competitors.

## The three ways this pattern goes wrong

**Factory-for-everything.** The interface accretes a `createX()` for each new type someone needs,
until it is a service locator. Detection: any two products that are never used in the same code
path. Fix: split by actual usage cluster, or delete and inject.

**A family of one.** One implementation, an interface, and a comment saying another will come.
Detection: `grep` for implementors; one, plus a test double, is one. Fix: delete the interface;
reintroduce it with the second family, when its shape is known rather than guessed.

**Family selected by a boolean.** `newFactory(boolean legacy)` grows into `newFactory(boolean
legacy, boolean v2, boolean tenantB)` and the call sites become unreadable. Fix: a named key
type — an enum or a sealed interface — from the start.

## Removing an Abstract Factory safely

1. Confirm no invariant binds the products (the test above).
2. Inline the factory at each call site so the concrete types are visible.
3. Move the selection to the composition root: either the container, or one `Map` in one place.
4. Delete the interface last. Keeping it "for now" preserves exactly the indirection you set out
   to remove.

If step 1 fails — an invariant does exist — do not remove the factory. Make the invariant
explicit in its name (`ReportFamily`, not `ReportFactory`) so the next reader does not repeat
the analysis.
