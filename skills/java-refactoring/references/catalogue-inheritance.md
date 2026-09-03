# Catalogue: moving members through a hierarchy

Every step here is **High** in `behaviour-preservation.md`'s table: nothing here is verified
by compiling, and none of it commits on a green suite alone. A hierarchy is a contract in
three directions at once — callers depend on substitutability, subclasses depend on the base
class's self-use, and frameworks depend on the shape (proxies, serialisation, JPA
inheritance mappings).

Whether the hierarchy should exist is java-composition-over-inheritance's question; these
are the mechanics once the answer is known.

## Pull Up Method

Identical methods on sibling subclasses move to the superclass.

**Precondition:** after renaming fields and locals to agree, the bodies are structurally
equivalent and field references preserve meaning. Calls to overridable methods require a dispatch
proof: pulling up can intentionally retain dynamic dispatch to existing hooks, but introducing a
new hook or changing overload/super-call resolution is a design change with fragile-base risk.

**What the pull-up actually changes:** every subclass now inherits the method, including
ones that never had it and ones outside the module. Enumerate them before, not after — and
if the class is `public` and extensible, see the closure test under Push Down, because the
set cannot be enumerated at all. A subclass that still overrides keeps its own behaviour; an
override the pull-up _removed_ is not a refactoring.

## Pull Up Field / Pull Up Constructor Body

**Field:** siblings declaring the same field under different names, unified and moved up.
Precondition: the field means the same thing in each — check every write, not just the type.
A `protected` field is a contract with every subclass forever, so pull it up `private` with
accessors where the subclasses can be adapted. Under JPA the move has a DDL consequence that
varies by strategy: free under `SINGLE_TABLE`, a column move across two tables under
`JOINED`, and add-everywhere-plus-backfill under `TABLE_PER_CLASS`
(inheritance-mapping-strategies).

**Constructor body:** common initialisation moves into a superclass constructor invoked by
`super(...)`. The hazard is **initialisation order**: superclass constructors run before
subclass field initialisers, so any pulled-up statement that reads a subclass field reads its
default — `null` or `0` — silently. (A subclass field that is a compile-time constant is
inlined at its use sites and misleadingly appears initialised, which makes the experiment
lie.) If the pulled-up code calls an overridable method, the override executes against an
unconstructed subclass.

Java 25 changes what is available, not what is safe: flexible constructor bodies (JEP 513)
let a subclass constructor validate arguments and **assign** its own fields in a prologue
before `super(...)`, so a field the pulled-up code reads can be set in time. The prologue
still cannot read `this`, and needing it means the base class is calling an overridable
method — fix that instead where you can.

## Push Down Method / Push Down Field

A member on the superclass used by only one subclass moves down.

**Precondition, decided before searching: can the subclass set be closed?** A fully closed sealed
hierarchy (no reachable `non-sealed` branch) provides an enumerated set. Package-private scope is
closed only when the package/artifact and class path are controlled and split-package consumers
are excluded. A public extensible class—or a sealed hierarchy with a `non-sealed` descendant—can
have external subclasses, so pushing a `protected` member down is breaking whatever repository
search finds. Close the hierarchy as a separate compatibility decision or route through
java-api-design. Separately, check framework access: moving a JPA/Jackson-visible member changes
the mapping even when Java callers are closed.

This is the fix for Refused Bequest when the hierarchy is otherwise sound.

## Extract Superclass

Two classes with common behaviour gain a shared parent.

**Precondition, mechanical:** neither class already extends another — Java has single
inheritance — and neither is a record or an enum. Where one does extend something, the
shared code becomes a delegate, not a parent.

**Precondition, design:** the commonality is a genuine is-a relationship, tested by LSP —
anything true of the superclass must be true of both subclasses, including exceptions thrown
and states reachable (java-solid). If the two classes merely share code, extract a helper
and delegate.

Steps: create the empty superclass; make both extend it; pull members up one at a time, each
its own commit.

**In a persistence model this is not a code step.** Extracting an unannotated superclass
silently unmaps the pulled-up fields; extracting an `@Entity` one defaults to `SINGLE_TABLE`
and demands one table for both, failing startup under `ddl-auto=validate` or rewriting the
schema under `update`. Where the parent only shares mappings, `@MappedSuperclass` preserves a Java
hierarchy without making the parent a polymorphically queryable entity
(inheritance-mapping-strategies).

**Cost:** a new coupling axis. Every future change to either class must now consider the
other, and the superclass becomes where unrelated things accumulate.

## Collapse Hierarchy / Remove Subclass

A subclass that no longer differs meaningfully merges into its parent. A subclass that only
distinguishes a type is replaced by a field on the parent — the reverse of Replace Type Code
with Subclasses, and right when the variants stopped carrying behaviour.

**Preconditions:** no caller depends on the type distinction — `instanceof`, a `switch` over
the hierarchy, a `Map<Class<?>, …>`, a Spring bean selected by type, a `@JsonSubTypes`
discriminator, a JPA discriminator column.

**The persistence failure differs per strategy and only one of them is loud.**
`SINGLE_TABLE`: orphan discriminator values fail to resolve on read. `JOINED` and
`TABLE_PER_CLASS`: there is no discriminator to orphan — the subtype's table is orphaned and
its rows silently disappear from every query, with no error anywhere. Either way the collapse
is a data migration, not a code change. The sharper case is the plain _rename_:
`@DiscriminatorValue` defaults to the entity name, so renaming a mapped subclass orphans
every existing row unless the value was pinned (inheritance-mapping-strategies,
`schema-evolution.md`).

## Replace Type Code with Subclasses

A field whose value selects behaviour becomes a hierarchy — in Java 25, usually a sealed
interface of records rather than a class hierarchy. The enum-versus-sealed choice and the
boundary-mapping cost are in `techniques.md`'s Replace Type Code; read that first.

**Precondition:** the type code is immutable for an object's lifetime. If an instance's code
changes at runtime, subclasses cannot represent it and the honest answer is a state field or
a state object.

## Replace Subclass with Delegate

The subclass is removed; the parent gains a field holding the variant behaviour, and
instances become plain parent instances holding a delegate.

**What changes:** the subclass _type_ ceases to exist. Callers holding the value as the
parent — including every collection typed by the parent — are unaffected, which is what
makes this the cheaper of the two delegate directions. What breaks is every reference to the
subclass type: declared variables and casts, `instanceof Subclass`, a `switch` case over it,
a `Map<Class<?>, …>` keyed on it, a Spring bean selected by that type, and any
`@JsonSubTypes` or JPA discriminator entry naming it — the last needing a data migration, as
above. At a published boundary this is a staged migration behind a new type, not a step.

**Cost:** delegation is verbose and every forwarded method is a place to forget. Take it
when the hierarchy varies along more than one axis, or when the base class's self-use has
already broken a subclass once.

## Replace Superclass with Delegate

The inverse direction, and the more common real case: a class extends another to reuse it
(`extends ArrayList`, `extends AbstractSomething`) rather than to be substitutable for it.
Convert the `extends` into a field, forward only the methods callers actually use, and stop
exposing the rest. The general step list is `techniques.md`'s Replace Inheritance with
Composition; the consequences at a boundary are here.

**Precondition, and the reason this direction is expensive:** extending a collection or a
framework base class publishes that whole API, and the migration is finished only when
nothing depends on the parts that will not be forwarded. For a `public` extensible class the
inherited surface is enumerable but its external _uses_ are not — same closure test as Push
Down. And where the parent is a framework base class the delegation may be impossible:
some frameworks dispatch to protected members by inheritance, and the extension point _is_
the inheritance (framework-coupling-and-independence).
