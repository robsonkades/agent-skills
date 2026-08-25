# Builder decision table

The question is never "would a builder look nice" but "what does the parameter list cost
callers today, and what does each construction form cost the API tomorrow".

## Decision table

| Situation                                                         | Use                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| ≤3 parameters, all required                                       | Constructor, or a record                                          |
| 2–3 parameters, one optional                                      | Two constructors, or a named static factory per variant           |
| Same-typed adjacent parameters (two `BigDecimal`, two `String`)   | Small: static factory with a value type per role. Larger: builder |
| ≥4 parameters, ≥2 optional                                        | Builder (mutable builder, immutable product)                      |
| Optional parameters with meaningful defaults                      | Builder with defaults in the builder's fields                     |
| Required subset must be unmissable, API has many external callers | Staged builder — after pricing the costs below                    |
| Immutable object that callers derive varied copies from           | Wither methods (`withStatus(...)`) on the product                 |
| Object graph assembled by a container (Spring, Guice)             | Neither — the container is the builder                            |

Two forms compose: a builder for construction plus withers for derivation is a normal
pairing on configuration-like types.

## False positives — parameter lists that do not want a builder

- **A record with a compact constructor.** Validation, normalisation and defensive copies
  live in the compact constructor; three or four required components need nothing more. A
  builder on top duplicates the canonical constructor and doubles the API surface.
- **JPA entities and Jackson-bound DTOs.** The framework instantiates them — JPA requires a
  no-arg constructor, Jackson binds via constructor annotations or setters. A hand-written
  builder fights the instantiation path the framework owns; constrain the design to what the
  framework instantiates, and keep builders for types you construct yourself.
- **A telescoping _pair_.** Two overloaded constructors at two to three parameters is
  ordinary overloading. The telescoping anti-pattern starts where overloads multiply to
  cover optional combinations — roughly the ≥4/≥2-optional line above.
- **Test-data builders.** Different economics: in tests, optionality with defaults _is_ the
  point, so a builder pays even for a three-field type. Do not let a test-data builder's
  existence argue for one in production code.
- **Two parameters, ever.** `Range.of(low, high)` beats `Range.builder().low(l).high(h)
.build()` in every dimension. Same-typed transposition risk at two parameters is solved
  with a factory name or a value type per role, not a builder.

## The staged builder's price list

A staged (step) builder encodes required-before-build in the types: `amount(...)` returns
`CustomerStage`, and only the final stage has `build()`. What it costs:

- **One interface per stage.** Five required parameters means five public interfaces plus
  the hidden implementation. That is API surface users see in completion and Javadoc.
- **Evolution is frozen.** Adding a required parameter inserts a stage: every caller that
  stored an intermediate stage type breaks at source level, and any external implementor of
  a stage interface breaks entirely. Adding an _optional_ setter to a stage interface breaks
  implementors unless it is a `default` method.
- **Ordering is fixed.** Callers must supply required parameters in the staged order even
  when their data arrives in another order.

Take staging when the API is consumed widely outside the team and a missing required
parameter fails late or expensively. Inside one codebase, a `build()` that throws with a
message naming the missing field is usually the better trade.

## Binary compatibility of fluent evolution

The JVM resolves a method by its full descriptor, return type included. Consequences:

- Changing a chaining method's return type — concrete builder to interface, subtype to
  supertype — is **binary-incompatible even where it stays source-compatible**: existing
  compiled callers fail with `NoSuchMethodError` until recompiled.
- Adding new setters to a final builder class is safe. Adding abstract methods to a
  published stage interface is not.
- Returning the concrete final builder type keeps evolution open (new methods are additive).
  Returning interfaces buys mockability and staging at the cost above. Decide per API, once.

## Wither allocation, honestly

`withX(...)` on an immutable type copies the instance per call, so a five-wither chain
constructs five objects and keeps one. The mechanism is allocation and copying; the verdict
requires a measurement. Escape analysis may eliminate the intermediate copies — it is never
guaranteed to. Do not redesign an immutable API around this cost without an allocation
profile showing it on a hot path.
