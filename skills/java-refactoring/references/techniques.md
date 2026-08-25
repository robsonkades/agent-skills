# Technique catalogue, mapped to Java 25

Each entry: when it applies, the mechanics as safe steps, and what it costs. Detection of
the smells these fix is java-code-smells; sizing judgement is java-clean-code.

## Extract Method / Inline Method

**Extract** when a block sits at a lower abstraction level than its neighbours or is
duplicated. Steps: copy block to a new method; pass live locals as parameters, return the
one written value (two written values means extract twice or introduce a record); replace
block with the call. Make it `static` when it reads no instance state — that documents
that it depends only on its parameters (not a purity claim: a static method can still
mutate its arguments or perform I/O). **Inline** is the inverse and equally legitimate: when the name
restates the body, the method has one caller and shares state awkwardly, inline it.
Cost: each extraction adds a name and a hop; each inline lengthens a method. Neither
direction is "cleaner" per se.

## Extract Class / Inline Class

**Extract** when field clusters are used by disjoint method groups (Divergent Change,
God Object). Steps: create the new class around one cluster; add it as a field of the
old; move methods one at a time (each its own commit), delegating from the old until all
callers are redirected; then remove the delegation. **Inline** kills a class that no
longer pays: a Middle Man, a speculative interface's only implementation. Cost:
extraction multiplies object wiring and can split a transaction-of-thought in two; do not
extract below the level at which invariants live.

## Move Method / Move Field

The Feature Envy fix: behaviour moves to the class whose data it reads. Steps: extract
the envious part if only part envies; recreate it on the target (taking former `this`
data as parameters if needed); delegate from the source; retarget callers; delete the
delegate. Moving _up_ an existing hierarchy is binary-compatible; moving to an unrelated
class breaks every external caller — check `compatibility.md` at public boundaries.
Cost: the target class grows a dependency it may not want (e.g. domain type gaining a
rendering method — sometimes the envy is the lesser evil).

## Rename

Highest value per unit of risk — but only via tooling: an IDE rename finds reflective
configs, overrides and Javadoc links that a text search misses. Renaming anything
published is API evolution (java-api-design), not a refactoring. Naming itself — what a
good name is — also lives there.

## Introduce Parameter Object

For Data Clumps and long signatures. The Java 25 form is a record with a validating
compact constructor, which moves an inter-parameter invariant out of every caller:

```java
record Parcel(double weightKg, Dimensions dimensions) {
    Parcel { if (weightKg <= 0) throw new IllegalArgumentException("non-positive weight"); }
}
```

Steps: introduce the record; add an overload taking it; migrate callers; remove the old
signature (or deprecate it first at public boundaries). Cost: only group parameters that
form a concept — a grab-bag record (`RequestContext` with nine unrelated components) is
the same smell with a constructor.

## Replace Conditional with Polymorphism — vs sealed + exhaustive switch

Both eliminate repeated type dispatch; they place code on opposite axes:

- **Polymorphism** puts each _variant_ in one place, spreading each operation across
  variants. Choose it when variants are added often and operations are stable, when
  other teams/modules must add variants, or when a variant owns state and behaviour
  that cluster naturally.
- **Sealed + exhaustive switch** puts each _operation_ in one place, spreading each
  variant across operations. Choose it when operations are added often and the variant
  set is closed and owned by one team, when variants are data-shaped (records) and
  behaviour lives outside them, or when exhaustiveness checking is the point: adding a
  variant must produce a compile error at every dispatch site.

Never write `default` in a switch over a sealed type — it converts every future
compile-time "you missed a case" into a silent wrong branch. The one exception is a
deliberately partial handler that documents why all unknown variants share one behaviour
(java-code-smells' modern-java reference). Guarded patterns keep the
exhaustiveness proof while expressing conditions:

```java
BigDecimal apply(Discount discount, BigDecimal price, int units) {
    return switch (discount) {
        case NoDiscount _ -> price;
        case Percentage(var rate) -> price.subtract(price.multiply(rate));
        case Volume(int min, var rate) when units >= min
                -> price.subtract(price.multiply(rate));
        case Volume _ -> price;
    };
}
```

Cost either way: polymorphism scatters an algorithm; switches concentrate coupling to
the whole hierarchy. Migrating between them later is mechanical but wide.

## Replace Type Code

`String status` / int codes / paired booleans become an enum when all variants carry the
same (or no) data, and a sealed interface of records when variants carry different data
(`FullRefund`, `PartialRefund(amount)`, `StoreCredit(amount, voucherCode)`). Steps:
introduce the type alongside the code; convert at the boundaries; migrate internals;
delete the raw code. Cost at persistence/serialisation boundaries: the wire and database
formats keep the raw code, so mapping stays at the edge — do not leak the enum's
`name()` into a contract you cannot change later.

## Encapsulate Collection

When a getter hands out the mutable collection that backs an invariant. Return a copy —
`List.copyOf(stops)` is cheap-to-idempotent on already-immutable lists — and add
mutators that enforce the invariant (`addStop` rejecting duplicates). Cost: copying on
every read is allocation in proportion to size and call rate; on a measured hot path an
unmodifiable view is the compromise (callers then see live changes — document it).
Depth on immutability trade-offs is java-immutability's.

## Introduce Factory / Strategy

**Factory** when construction grows policy: a static factory names the intent
(`LedgerEntry.settlement(...)`), can return cached or subtype instances, and gives Replace
Conditional a home for variant selection. **Strategy** when an algorithm varies
independently of its host: in Java 25 a strategy with one method is a functional
interface — accept a lambda before defining a class hierarchy, and define a new interface
only when the standard functional shapes obscure intent. Cost: every factory/strategy is
indirection; introduced speculatively they are the Speculative Generality smell.

## Replace Inheritance with Composition

For Refused Bequest and fragile-base coupling. Steps: add a field of the (former) parent
type; convert each inherited-member use to delegation, one commit at a time; remove the
`extends`; expose only the methods callers actually used. The subtype relationship
disappears — callers that used the subclass _as_ the parent break, so at public
boundaries this is a staged migration behind a new type, not one step. When inheritance
is genuinely right, and the sealed middle ground, is java-composition-over-inheritance's
topic.

## Decompose / Simplify Conditional

Nested conditionals flatten by: guard clauses first (return early on the exceptional
paths); extract each condition into a named predicate method when the expression does
not read at the method's level; consolidate arms that duplicate fragments. A boolean
expression that needs a comment becomes a method named by that comment. Cost: guard
clauses multiply exit points — fine in short methods, a liability in 60-line ones (split
first, java-clean-code owns that call).
