# Semantic contracts for Java values

Read the relevant section when its policy can change the implementation. Examples below
are modeling choices to verify with the owning context; they are not universal DDD rules.

## Meaning before representation

An `OrderID` is a value expressing an identifier; it does not turn the referenced order
into a value object. Keep `OrderID` and `CustomerID` different types even if both wrap a UUID
when accidental interchange is a real failure mode. Do not expose arithmetic on identifiers.
Avoid creating a wrapper for every primitive without a vocabulary, constraint, operation,
or type-safety benefit.

A persisted row does not automatically confer domain identity. A shipping address copied
into an order may be an immutable snapshot even when its storage has a technical key. In a
property-management context, the same-looking address may identify a managed location with
a lifecycle. DTO fields likewise do not determine value semantics. These distinctions
follow [Fowler's context-sensitive discussion of value objects](https://martinfowler.com/bliki/ValueObject.html).

## Input forms and canonicalization

Specify an accepted language before a canonical representation. For example, a synthetic
document contract may accept exactly `DOC-` followed by eight ASCII digits. That does not
authorize `replaceAll("\\D", "")`, trimming, case folding or conversion to a number.
Deleting unexpected characters can make `12oops34` collide with a valid identifier; number
conversion can discard meaningful leading zeroes. Syntax, checksum, current registration,
and ownership are separate claims requiring different evidence.

If both formatted and unformatted documents are supported, validate each complete format
first, then map their approved separators to the same value. Preserve the original input
in the boundary record when needed for audit, separate from semantic equality. A business
name may permit whitespace normalization while a case-sensitive external token may not.
Unicode normalization and case folding require a named policy; an arbitrary regex or
default locale does not establish equivalence. Bound input sizes before expensive parsing.

Parsing and validation factories remain deterministic. A document parser must not call a
registry, clock or repository. A separate identifier generator such as `CategoryID.unique()`
may create a new identity; do not disguise generation as parsing an existing value.
When policy genuinely depends on a country, document type or version, model
that discriminator explicitly and decide whether it belongs in equality. An empty string
is not a universal absence value; keep optionality outside a required-value type unless
the domain names a meaningful empty value.

## Equality, hashing and ordering

List the semantic components before generating methods. Mutable technical metadata, a
database row key and a serializer cache usually do not belong in value equality. Include
units, currency and policy discriminators when differences change substitutability. Do not
add inheritance for convenience when subclasses would change equality. Prefer a `final`
class unless a deliberate type hierarchy has a documented equivalence contract.

Check reflexivity, symmetry, transitivity, consistency, null and unrelated types. Equal
values must produce the same hash; unequal values may collide. A hash is not a durable
business identifier. These are [Java Object contracts](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Object.html#equals(java.lang.Object)>).

Do not implement fuzzy numeric equality using an epsilon: proximity can be nontransitive.
Use an explicit `isWithin(tolerance, other)` operation, or a named quantization policy that
creates an equivalence relation. An ordering that ignores a component included in equality
can make a sorted collection discard a distinct value. Cross-currency amounts have no
natural economic order without an exchange-rate context; do not hide that conversion in
`compareTo`.

## Exact amounts and currencies

Decide separately: accepted input precision, stored calculation precision, settlement
scale, rounding mode and rounding stage. A price, tax calculation and payable amount may
need different contracts. Define how residual minor units are allocated when division
must conserve a total. Exchange conversion is an explicit operation with rate provenance;
an `add` between unlike currencies should fail unless conversion is its declared purpose.

`BigDecimal.equals` includes scale; `compareTo` does not. Choose scale-sensitive equality,
or canonicalize before both equality and hashing. A fixed-scale amount can use
`setScale(scale, UNNECESSARY)` to accept exact equivalents and reject precision loss.
Construct decimals from their decimal input rather than routing through `double`. An
exact divide may fail for nonterminating results; rounding is a policy, not a catch-all
exception fix. See the [Java BigDecimal contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/math/BigDecimal.html).

Do not equate ISO default fraction digits with a ledger or cash-rounding rule.
`Currency.getDefaultFractionDigits()` also returns `-1` for some pseudocurrencies;
see [Currency's API](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/Currency.html#getDefaultFractionDigits()>).
Integral minor units still need a currency, unit scale, and checked overflow arithmetic.
Keep calculation values distinct from display formatting. A chosen wire representation
must preserve the amount without asking clients to guess its unit or scale.

## Composite values and records

A record provides component-based generated methods, not a proof of domain semantics.
Its canonical constructor is a creation path, and reference-valued components can point
at mutable state. Arrays need explicit content equality and defensive copying rather than
the generated reference comparison. Custom record implementations must preserve their
component-copy invariant. Consult the [Java Record contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Record.html).

For a list of already immutable values, `List.copyOf` isolates subsequent structural
changes to the source and prohibits writes through the returned list. It does not copy
mutable elements and rejects null elements. An unmodifiable view over a caller-owned list
is insufficient. These are [List's collection contracts](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/List.html#copyOf(java.util.Collection)>).

For arrays, copy on ingress and egress; copy nested mutable elements too or replace them
with immutable values. Do not claim deep immutability from `final` fields. Decide whether a
collection represents a sequence, set or multiset: order and duplicates are semantic
choices, not a performance detail. Enforce size and member invariants before publication.
Test mutation through both the original input and the returned accessor.

## Ranges, units and time

A range needs endpoint types, inclusivity, empty-range policy, and a rule for inversion.
For `[start, end)`, touching ranges do not overlap; decide explicitly whether they can
merge. A date range is not an instant range. Define the zone needed to turn a local business
date/time into an instant and the policy for ambiguous or nonexistent local times.
`Instant`, `LocalDate`, `Duration` and `Period` represent different concepts; the
[java.time API](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/package-summary.html)
distinguishes timeline instants, local dates, elapsed amounts and calendar amounts.

Do not add two temperatures as if they were distances merely because both contain a
number and a unit. Model affine units, conversion precision and valid domains deliberately.
For elapsed durations use the required precision and bounds. An expiry date can be a
stable value while `isExpired(at)` depends on an explicitly supplied instant; do not bake
the current clock into equality or a factory whose result later becomes invalid.

## Persistence and JSON boundaries

Keep the stable business value separate from the representation chosen by a database or
consumer. A mapper may store components in several columns or a formatted string; the
domain type need not mirror that shape or carry JPA/JSON annotations in this architecture.
Inspect actual adapter and library versions before prescribing mapping APIs.

Round-trip tests must check meaning: same amount and currency, preserved leading zeroes,
absence policy, collection order, date/zone information, and failure on invalid legacy data.
Database precision, driver conversion and a client's number parser can lose information
even when pure Java equality is correct. Rehydration should produce a valid object or an
explicit compatibility failure. When old and new rule versions differ, design a migration
or explicit legacy representation; silently sanitizing historical values hides corruption.

Changing normalization or equality can collapse previously distinct rows or keys. Examine
existing uniqueness constraints, cache keys, serialized messages and consumers before
changing them. Share values between contexts only when their meaning and evolution are
jointly owned. Matching JSON schemas alone are insufficient evidence of a shared kernel.

## Adapting the reference project's conventions

The supplied catalog example puts `CategoryID` in `domain.category`, with an `Identifier`
base type extending `ValueObject`. It uses `from(String)`, `unique()` and `getValue()`.
Keep these names when extending that project; the generic `of` fixture is not a rename
instruction. The empty `ValueObject` base has no equality implementation, so inspect each
concrete class rather than relying on inheritance.

In `domain.video`, `ImageMedia.with(...)` has final string fields and equality based on
checksum and location. Its test explicitly permits differing names and generated ids to
compare equal. That is evidence of this model's chosen equivalence, not a general media
rule: establish which components the target context considers substitutable before
reusing it.

`Resource` stores and returns the caller's `byte[]` directly; its name and base class do
not protect it from mutation. A record such as `VideoResource` that embeds this object
inherits that exposure. If an immutable content value is required, copy bytes at both
boundaries and define equality for the chosen content/metadata contract. If identity or
streaming ownership is the actual requirement, model that explicitly instead of labeling
the mutable resource a value object. These observations come from source inspection;
they are not results of running the reference project's test suite.
