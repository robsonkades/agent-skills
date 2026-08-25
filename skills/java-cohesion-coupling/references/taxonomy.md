# Coupling and cohesion taxonomy, in Java terms

## Coupling types, worst first

**Content coupling — reaching into another module's internals.** In Java:
`setAccessible(true)` on another package's private members, depending on another
package's class being a specific concrete subtype, or parsing another component's
log output or serialised form. Detection: reflection across package boundaries,
casts to implementation types the API never returned. Always a finding; there is
no benign version outside test infrastructure and frameworks that own the
contract.

**Common coupling — shared mutable state.** In Java: a mutable `static` field or
singleton read and written from several packages, a shared `Properties` or config
object mutated at runtime, a static registry that classes populate on class-load.
Detection: `static` non-final fields with cross-package writers; grep for
`getInstance()` callers that mutate. The blast radius is invisible in the
dependency graph — the graph shows edges to the holder, not who overwrites whom.

**Control coupling — telling the callee how to behave.** In Java: `boolean` or
enum flag parameters that select the callee's algorithm
(`render(data, /* isAdmin */ true)`), mode fields consulted deep inside. The
caller must know the callee's internals to pick the flag. Fix is usually two
methods or a variant type. False positive: a flag that is genuine _data_ the
domain defines (a `RoundingMode` passed to division is the domain's own
vocabulary, not control flow leakage).

**Stamp coupling — passing more structure than is used.** In Java: a method takes
an `Order` and reads two of its eleven fields, or a web DTO travels three layers
so the innermost can read one string. Every caller must now construct or obtain
the whole structure, and tests must too. Detection: a parameter type whose
accessors are mostly unused in the method body. False positive: a domain type
passed to code that legitimately operates on the whole concept — passing `Money`
where only `amount()` is read today is still right, because currency belongs with
amount.

**Data coupling — parameters and return values of exactly what is needed.** The
normal, healthy case. Not a finding; listed so reviews stop trying to "fix" it.

## Cohesion types

**Functional — one package, one capability.** Everything in `shop.pricing` exists
to price things; a change to pricing policy lands here and nowhere else. The
target state; recognise it by the package name being a capability, not a layer or
a category.

**Communicational — grouped around the same data.** A package holding everything
that reads and writes `StockLevel`. Acceptable and common; weaker than functional
because two capabilities sharing data still share a package, so their change
streams interleave. Split when the history shows independent streams (the
evidence standard is java-solid's SRP treatment, one level down).

**Temporal — grouped because it runs at the same time.** `startup`, `shutdown`,
`OnBoot*` classes. The grouping says _when_, not _what_, so unrelated concerns
collect. Unavoidable in lifecycle wiring — a composition root is temporally
cohesive by nature and correct. The finding is business logic living there
because "it also runs at startup" (cache warming that encodes pricing rules).

**Logical — grouped by category.** `util`, `common`, `base`, `helpers`, `misc`.
The members share nothing but a vague kind, every package depends on it, and it
only grows. Detection: afferent coupling from everywhere, exports of unrelated
vocabulary. Sometimes fine: a small, stateless, dependency-free leaf
(`StringPadding`, `Hex`) is cheap to depend on precisely because it can never
change for domain reasons. The rot begins when a "utility" acquires a domain
noun — `OrderUtils` is a missing method on `Order` or a missing domain service,
filed in a junk drawer.

## False positives across the board

- **High fan-in is not a defect.** A stable, abstract package that half the system
  imports (`shop.money`) is doing its job; that is what stability is for.
- **An adapter importing a vendor SDK heavily** is not "too coupled" — it exists
  to absorb exactly that coupling so nobody else does. Judge the system by who
  _else_ imports the SDK.
- **Generated code** (protobuf, JPA metamodels) shows extreme stamp and content
  patterns and is exempt: nobody hand-maintains it, so its coupling costs nothing
  at change time. Exclude it from the graph before analysing.
- **A test package coupled to everything it tests** is definitionally fine;
  coupling analysis applies to production edges.
