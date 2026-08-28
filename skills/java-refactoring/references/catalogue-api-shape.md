# Catalogue: reshaping a signature

These steps change what a caller writes. Inside a deployable you rebuild atomically the
compiler finds every caller the AST reaches — never the reflective ones, and a `private`
modifier is no protection when JPA field access or Jackson reaches past it. Close the caller
set both ways (`behaviour-preservation.md`) and classify the symbol
(`compatibility.md`) before picking the step; across a published, exported, serialised or
framework-mapped boundary each of these stops being a refactoring and becomes API evolution.

## Change Function Declaration

The parent technique: any change to a name, parameter list, or return type. It has two
mechanics, and choosing wrong is what makes signature changes painful.

**Simple** — rename or reshape in place, let the compiler list the callers, fix them all in
one commit. Available only when every caller is in reach.

**Migration** — add the new signature alongside; make the old one delegate; move callers in
separate commits; delete or `@Deprecated(since = …, forRemoval = true)` the old one last.
Required whenever callers are out of reach, and the sane choice inside a codebase too
whenever "all callers" exceeds a reviewable diff.

**Precondition on the delegate:** the old signature's body after the change is exactly one
call to the new one — no literal added, no `null` supplied for a new parameter, no exception
type changed, no argument reordered by hand — and the old signature's tests pass unedited
against it. A default invented for a new parameter is a behaviour change hiding in a
compatibility shim, and needs its own commit.

## Encapsulate Variable

A field or global accessed directly gains an accessor, so the access point becomes one place
that can later validate, copy, log or compute.

**Precondition:** every access is redirected. Make the field `private` in the same commit
and let the compiler prove the static half was total; the framework half needs the string
search, because JPA field access, Jackson and anything binding by field name reach past the
accessor.

This is the enabler for Replace Derived Variable with Query, Encapsulate Collection
(`techniques.md`) and Replace Primitive with Object. For mutable shared data it is also a
prerequisite for synchronisation work, since there must be one place to synchronise — but
the step creates the access point, not thread safety. `synchronized` accessors make each
access atomic and leave every `get`/modify/`set` a race; java-memory-model owns what
actually has to be atomic.

## Separate Query from Modifier

A method that returns a value _and_ changes state splits into a query and a command.

**Why it matters more than it looks:** callers start calling the query from logging,
assertions and debuggers, and every such call currently mutates. Splitting removes a class
of Heisenbug — but only if the split is real; leaving the query returning a cached value the
command populates recreates the coupling.

**Precondition:** enumerate the call sites and classify each as wanting the value, the
effect, or both, and convert each in the same commit. A site whose intent you cannot read
gets a characterisation test first — splitting it blind silently deletes the mutation for
that caller.

**Where it does not apply:** genuinely atomic test-and-set operations. `Map.putIfAbsent`,
`AtomicInteger.getAndIncrement` and `Queue.poll` return-and-modify by design, and splitting
them introduces a race. Concurrency beats this rule.

## Parameterize Function

Several methods differing only in a literal merge into one taking that value.

**Precondition:** the bodies are otherwise identical, and the parameter is a _value_ rather
than a switch over behaviour. The inverse — splitting one function back into named ones when
the parameter selects behaviour — is Remove Flag Argument below. Older sources call that
inverse _Replace Parameter with Explicit Methods_; it is the same refactoring under its
former name, not a separate one.

## Remove Flag Argument

`process(order, true)` becomes `processImmediately(order)` and `processDeferred(order)`.

**Precondition:** the flag selects between distinct behaviours, not a genuine two-valued
property (`withRetries(true)` in a builder is a property, and fine). Steps: extract the
shared body first; add the two named methods delegating to the flagged one; migrate call
sites, resolving each literal; inline the flagged method into each. Where some caller passes
a variable, the flag stays for that path and the boolean lives at exactly one `if`.

**Cost:** two entry points where there was one — and duplication if the shared part was not
extracted first, which is why that is step one and not step three.

## Preserve Whole Object / Replace Parameter with Query / Replace Query with Parameter

Three ways to move the same decision: who fetches the data.

**Preserve Whole Object** — pass the object rather than three values pulled from it.
Precondition: the object is immutable, or the callee finishes before any holder mutates it.
If it is a JPA entity, the callee must run inside the same persistence context — passing the
entity where three values went is how `LazyInitializationException` appears in a callee that
never touched the database. Across a serialisation boundary it also puts every field of the
object on the wire, which is a contract change and sometimes a disclosure
(remote-facade-and-dto).

**Replace Parameter with Query** — drop a parameter the callee can derive. Precondition: the
callee can reach the value _and_ the value cannot differ from what the caller intended; not
available when the caller deliberately passes an overridden or snapshotted value. If the
callee reaches it remotely, the step adds a call and a new failure mode per invocation — the
wrong direction across a process boundary (distribution-boundaries).

**Replace Query with Parameter** — the inverse, and the one that pays most often: it removes
a dependency from the callee, making it a function of its arguments for that dependency and
testable without wiring. Push the dependency up until it reaches code that already has it.
This is the mechanical core of humble-objects-and-functional-core.

## Remove Setting Method

Delete a setter for a field that must not change after construction, moving the value into
the constructor.

**Precondition:** no framework needs it, and the two common ones differ. Jackson needs a
mutator only without constructor binding (`-parameters` plus the parameter-names module, on
by default in Spring Boot; records work as-is) — prefer that configuration to keeping the
setter. JPA with field access never needed the setter, but **does** require a
public-or-protected no-arg constructor, and no configuration lifts that requirement, so an
`@Entity` reaches neither a record nor all-final fields. Removing a setter is
binary-breaking for out-of-reach callers.

Where it does fit, the end state is a record or a final-field class; java-immutability owns
how far to take it.

## Replace Constructor with Factory Function

A `new` call becomes a named static factory: `LedgerEntry.settlement(...)`. When factories
are worth introducing is in `techniques.md`; the mechanics are here.

Returning a cached instance or a subtype is what the factory _enables_, not part of this
step: `new` guarantees a fresh object, and caching changes `==`, identity-keyed maps and
what a `synchronized (obj)` block locks. Introduce the factory in one commit; change what it
returns in another.

**Cost:** unless the constructor's visibility can be reduced afterwards, both forms exist
indefinitely and new call sites must be steered by review. On a type JPA or Jackson
constructs, the constructor stays and the two forms coexist by necessity. Reducing
visibility is source- and binary-breaking for external callers, so on a published type it is
a migration with a deprecation window, not a step.

## Replace Command with Function

A command object whose only job is `execute()` on state passed at construction collapses
into a function.

**Precondition:** one public operation, no lifecycle, no state outliving the call. Where the
object exists to be queued, retried, serialised or undone, the object _is_ the design —
collapsing it deletes the mechanism (task-queues-and-competing-consumers).
