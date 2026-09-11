# Builder decision table

The question is never "would a builder look nice" but "what does the parameter list cost
callers today, and what does each construction form cost the API tomorrow".

## Decision table

| Situation                                                       | Use                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| Few cohesive required parameters with clear roles               | Constructor, record, or named factory                          |
| One optional mode/default and few combinations                  | Named factories or a delegating overload                       |
| Same-typed adjacent parameters (two `BigDecimal`, two `String`) | Role types, named factory or builder according to caller risk  |
| Many named options or invalid positional combinations           | Builder (mutable builder, immutable product)                   |
| Optional parameters with meaningful defaults                    | Factories for few forms; builder when combinations warrant it  |
| Required sequence must be enforced through gradual construction | Staged builder — after pricing the costs below                 |
| Immutable object that callers derive varied copies from         | Wither methods (`withStatus(...)`) on the product              |
| Service object graph assembled by a container (Spring, Guice)   | Constructor injection; do not add a product builder for wiring |

Two forms compose: a builder for construction plus withers for derivation is a normal
pairing on configuration-like types.

## False positives — parameter lists that do not want a builder

- **A record with a compact constructor.** Validation, normalisation and defensive copies can
  live there. A few cohesive components often need nothing more; a wide public record remains a
  positional API and may still deserve factories, role types or a builder.
- **JPA entities and Jackson-bound DTOs.** JPA entity construction has its own no-arg/access
  contract; Jackson can bind constructors, setters, records or configured builders. Do not add a
  builder unless the actual framework path is configured and tested; a builder used only by
  application code does not replace the persistence/serialization contract.
- **A telescoping _pair_.** Two overloaded constructors at two to three parameters is
  ordinary overloading. The telescoping anti-pattern starts where overloads multiply to
  cover optional combinations. Inspect ambiguity and usage instead of applying a numeric cutoff.
- **Test-data builders.** Different economics: in tests, optionality with defaults _is_ the
  point, so a builder pays even for a three-field type. Do not let a test-data builder's
  existence argue for one in production code.
- **Two clear required parameters.** `Range.closed(low, high)` normally beats
  `Range.builder().low(l).high(h).build()`. Distinct factories or role types usually solve
  transposition; unusual staged/domain DSL requirements still need their own evidence.

## The staged builder's price list

A staged (step) builder encodes required-before-build in the types: `amount(...)` returns
`CustomerStage`, and only the final stage has `build()`. What it costs:

- **Public stage types.** A type per required stage plus a final options/build surface can make
  a small value expose a large API in completion and Javadoc.
- **Evolution is constrained.** Inserting a required stage can change return types and reachable
  calls. Check actual stored stage variables, chains and implementors; different changes have
  different source, linkage and invocation effects, detailed below.
- **Ordering is fixed.** Callers must supply required parameters in the staged order even
  when their data arrives in another order.

Take staging when gradual ordered construction and costly sequence errors justify its surface.
A required-argument factory or a `build()` that names the missing field is often sufficient,
including for published APIs. Wide consumption increases both misuse exposure and evolution cost.

Staging restricts the statically visible call sequence, not nullness or semantic validity.
Retained stage aliases, repeated setters and casts can bypass an intended single-use sequence,
especially when one implementation implements every interface. Keep runtime validation and
explicit reuse/ownership rules; stages are not linear types.

## Binary compatibility of fluent evolution

The JVM resolves a method by its full descriptor, return type included. Consequences:

- Changing a chaining method's return type — concrete builder to interface, subtype to
  supertype — is **binary-incompatible even where it stays source-compatible**: existing
  compiled callers can fail with `NoSuchMethodError` if the old descriptor no longer resolves.
  Check compiler-generated bridges and inheritance rather than inferring linkage from source alone.
- Adding a uniquely named setter to a final builder is normally binary-compatible, but overloads
  can introduce source ambiguity, erasure clashes or changed lambda resolution.
- Adding an abstract interface method preserves compatibility with pre-existing binaries, but
  implementors may fail recompilation and a new caller invoking it on an old implementation can get
  `AbstractMethodError`. A suitable default can supply behavior, but inherited default conflicts
  need separate checks. Do not classify every stage-method addition as the same breaking change.
- Returning the concrete final builder type keeps evolution open (new methods are additive).
  A stage interface controls visible sequencing; an implementation-hiding interface can also
  separate capabilities. Decide whether external implementation is supported, and test those
  implementors when evolving the contract instead of relying on an unchecked self-type cast.

## Wither allocation, honestly

`withX(...)` may allocate when a value changes, may reuse `this` for a no-op, and may share
immutable components. A five-wither chain therefore does not imply five heap allocations.
The possible mechanism is allocation and copying; the verdict
requires a measurement. Escape analysis may eliminate the intermediate copies — it is never
guaranteed to. Do not redesign an immutable API around this cost without an allocation
profile showing it on a hot path.

Each wither must still return a valid value. Moving an interval from `[1,5]` to `[10,20]` through
`withLower(10).withUpper(20)` would make the first intermediate value invalid. Offer a coordinated
`withBounds(10,20)`, factory or builder update rather than weakening the invariant to allow a chain.

For return-type evolution, consult [JLS §13.4.15](https://docs.oracle.com/javase/specs/jls/se25/html/jls-13.html#jls-13.4.15)
and [interface evolution](https://docs.oracle.com/javase/specs/jls/se25/html/jls-13.html#jls-13.5.4);
inspect the emitted descriptors/bridges and exercise the actual old/new artifacts.
