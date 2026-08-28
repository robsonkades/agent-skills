# Catalogue: statements, loops and data organisation

The small steps. Individually each looks not worth a commit; collectively they are the
reason a large restructuring can be done in reversible increments — most Extract Method
attempts that "won't come out cleanly" need two or three of these first. Each entry gives
the precondition that makes it behaviour-preserving, the mechanics, and its cost.

## Slide Statements

Move a statement so that things touching the same data sit together — usually a
declaration down to its first use, or a group of related lines into one block.

**Precondition — no interference.** The moved statement and every statement it crosses
must not share mutable state in either direction: no variable, field or collection written
by one and read or written by the other, and no two side effects whose order is observable
(two writes to the same row, two log lines an operator reads as a sequence). Method calls
are opaque: a call may cross another only if you have read both bodies far enough to see
that everything they touch stays in locals. At the first reach into a field, a repository,
a publisher or a logger, stop — the slide is not local, so extract instead.

**Java specifics.** Sliding a declaration across a `try` boundary changes what is in scope
in `catch`/`finally`. Sliding across a lock boundary is a lock-scope change rather than a
slide, in both directions — outward drops protection, inward can put a blocking or alien
call under a lock (`behaviour-preservation.md`). Sliding past a `return` or `throw` in a
branch changes whether the statement runs at all.

**Cost:** the smallest in the catalogue, and it is the enabler for Extract Method.

## Split Loop / Combine Loops

**Split** when one loop body does two unrelated things: give each its own loop, after
which each extracts cleanly into a named method.

**Preconditions.** The two bodies must not depend on each other's per-iteration state. The
source must be **re-traversable** — a `Stream`, `Iterator`, `Scanner` or streaming
`ResultSet` is consumed by the first loop and the second sees nothing. The collection must
not be mutated during iteration **by any thread**: over a shared collection the split adds
a second traversal that can legally observe a different element set (concurrent collections
have weakly consistent iterators and throw nothing), so "A and B saw the same elements"
stops holding. And there must be no early exit — a `break` or `return` in body A currently
truncates body B, and splitting silently extends body B to the whole collection.

**The invariant people miss is failure order.** With body A before body B, if B throws on
element 7 the merged loop has already performed A seven times; the split version performs A
for all n before B throws at all. Where either body writes or can fail, the split changes
behaviour — extract two methods called from one loop instead.

**Combine** is the inverse and usually the wrong direction: worth doing only when the two
loops were one concept split by accident, or when a measurement (java-performance) shows
the second pass matters.

**Cost:** two traversals, and converting to two stream pipelines is the same trade with
more allocation. Bring a benchmark before defending either on a hot path.

## Split Phase

When a method does "parse and validate, then compute", separate it into two functions with
an intermediate record between them. It is the technique that unblocks a long method whose
every candidate block shares locals.

**Precondition — failure order and interleaved effects.** After the split the whole first
phase runs before any of the second. Two things move: an input that fails validation at
element 7 now fails before element 1 was computed, along with any side effect that
computation carried; and any effect the second phase performs today _between_ two
first-phase statements is reordered. Check that the first phase is a pure transformation of
its inputs into the record — no writes, no publishes, no logging read as a sequence — and
that everything the second phase reads fits in the record. A local mutated by both halves
means the seam is in the wrong place.

Steps: extract the second phase into a method taking the locals it needs; introduce the
record; make the first phase build and return it; extract the first phase. Each step
compiles and runs.

```java
record PricingInputs(Product product, int quantity, DiscountCode code) { }
```

**Cost:** one extra type, and an allocation escape analysis may or may not eliminate. What
it buys is halves that can be tested independently — the parse half against malformed
input, the compute half against values that are hard to reach through the parser.

## Split Variable

A local assigned more than once for different purposes becomes one variable per purpose,
each `final`.

**Precondition:** it is not a genuine accumulator — a loop counter or running total is one
purpose, not several. Steps: rename the first use-range, compile (the compiler finds every
use you did not update), repeat.

The payoff is mechanical: effectively-final locals are what lambda capture requires, and
what lets Extract Method take a local as a parameter instead of returning it. "Local
variables referenced from a lambda must be final or effectively final" is, most of the
time, a reused variable asking to be split.

## Replace Temp with Query

A local computed once and then used becomes a method.

**Precondition — the one that gets skipped:** the expression must stay referentially
transparent between the original computation point and the last use. No field it reads may
be written in between, it must not perform I/O or advance an iterator, and — the case the
single-threaded reading misses — no _other thread_ may write those fields. The temp _was_
the snapshot; the query re-reads, and two uses can disagree inside one operation. That is a
new check-then-act race, not a cleanup.

If the expression can throw, the throw moves with it: a temp computed unconditionally that
becomes a query called in one branch stops failing on the other paths.

**Cost:** recomputation. A query used inside a loop turns one evaluation into n. A query
that hits the database or sorts a collection is a performance change disguised as a cleanup.

## Replace Derived Variable with Query

A field kept in sync with other fields — `total` updated by every mutator — becomes a
computed accessor, deleting a bug class (the two fall out of sync) along with the state.

**Precondition, first and most destructive:** the value is genuinely derivable from
_current_ state, not a snapshot of state at an earlier time. An order total taken at
checkout, or a fee at the rate then in force, is history: recomputing it from today's prices
silently rewrites old invoices. If recomputing can differ from the stored value, the field
stays.

**Precondition, second:** no serialisation or persistence contract carries it. A JPA
`@Column` on `total`, or a JSON field consumers read, is a contract
(`compatibility.md`). With field access — the JPA default — deleting the field deletes the
mapping, loudly only under `ddl-auto=validate`; and any JPQL or `@Query` string filtering or
ordering on it breaks at runtime. Where the value must persist but should not be maintained
by hand, the end state is `@Formula` or `@Transient`, not a deleted field.

Records make the healthy form obvious: components are the state, derived values are methods.

## Move Statements into Function / Move Statements to Callers

**Into function** when _every_ caller performs the same statement before or after the call.
Close the caller set both ways before believing "every" — reduce visibility and compile for
the static callers, string-search the name for the framework-reached ones
(`behaviour-preservation.md`). A missed caller silently loses the statement.

**To callers** when only some callers want it. This is the honest fix for a function that
grew a boolean parameter to skip part of itself; the flag removal that follows is in
`catalogue-api-shape.md`.

## Replace Inline Code with Function Call

Code that reimplements something the library or domain already provides becomes a call to
it.

**Precondition:** the existing function's edge cases match _exactly_. This is a classic
source of silent behaviour change — hand-rolled trimming, splitting, rounding and date
arithmetic rarely agree with the library on empty input, null, locale, `RoundingMode` or a
trailing separator. Pin the current behaviour on those inputs before swapping
(`safety-workflow.md`), or generate them (the differential rung in
`behaviour-preservation.md`, which is the right instrument here).

## Change Reference to Value

Make the object immutable and equal by state, then copy it instead of sharing one instance.

**Precondition:** the type has no mutator called after construction — enumerate every
non-private setter and mutating method and every call site of each. If any is called on an
instance another scope also holds, this is a behaviour change, not a step.

In Java 25 the target form is a record with a validating compact constructor, and the full
consequence list of that conversion — finality, equality, accessor names, serialisation —
is `compatibility.md`'s "Class ↔ record". Two things it does not carry: code using `==` or
`IdentityHashMap` keeps compiling and silently changes result, so search for both; and an
`@Entity` cannot be a record at all (non-final class, no-arg constructor, non-final fields
for proxies), though an `@Embeddable` can from Hibernate 6.2.

## Change Value to Reference

The opposite, when copies must be updated together: introduce an owner — a registry,
repository or cache — that returns one instance per identity, and route construction
through it.

**Precondition:** name the field or field set that is unique per instance and never written
after construction; if you cannot name one, there is no identity to key on. Then compare
scopes: the owner must be at least as long-lived as its longest-lived holder — a
request-scoped owner with a singleton holder is the failure.

The instance is now shared mutable state, so the owner must be thread-safe and every
mutation needs a documented guard. In a persistence codebase this is rarely a code
refactoring: the owner that returns one instance per identity already exists and is the
persistence context, which is neither thread-safe nor longer-lived than the transaction. A
static map of entities is a leak, not a registry — the real question is whether the concept
is an `@Embeddable` or an `@Entity`, and answering it changes the schema
(orm-structural-mapping).
