# Builder decision table

The question is never "would a builder look nice" but "what does the parameter list cost
callers today, and what does each construction form cost the API tomorrow".

## Decision table

| Situation                                                         | Use                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Few cohesive required parameters with clear roles                 | Constructor, record, or named factory                             |
| One optional mode/default and few combinations                    | Named factories or a delegating overload                          |
| Same-typed adjacent parameters (two `BigDecimal`, two `String`)   | Small: static factory with a value type per role. Larger: builder |
| Many named options or invalid positional combinations             | Builder (mutable builder, immutable product)                      |
| Optional parameters with meaningful defaults                      | Builder with defaults in the builder's fields                     |
| Required subset must be unmissable, API has many external callers | Staged builder — after pricing the costs below                    |
| Immutable object that callers derive varied copies from           | Wither methods (`withStatus(...)`) on the product                 |
| Service object graph assembled by a container (Spring, Guice)     | Constructor injection; do not add a product builder for wiring    |

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
  cover optional combinations — roughly the ≥4/≥2-optional line above.
- **Test-data builders.** Different economics: in tests, optionality with defaults _is_ the
  point, so a builder pays even for a three-field type. Do not let a test-data builder's
  existence argue for one in production code.
- **Two clear required parameters.** `Range.closed(low, high)` normally beats
  `Range.builder().low(l).high(h).build()`. Distinct factories or role types usually solve
  transposition; unusual staged/domain DSL requirements still need their own evidence.

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
- Adding a uniquely named setter to a final builder is normally binary-compatible, but overloads
  can introduce source ambiguity, erasure clashes or changed lambda resolution. Adding abstract
  methods to a published stage interface breaks implementors.
- Returning the concrete final builder type keeps evolution open (new methods are additive).
  Returning interfaces buys mockability and staging at the cost above. Decide per API, once.

## Wither allocation, honestly

`withX(...)` on an immutable type copies the instance per call, so a five-wither chain
constructs five objects and keeps one. The mechanism is allocation and copying; the verdict
requires a measurement. Escape analysis may eliminate the intermediate copies — it is never
guaranteed to. Do not redesign an immutable API around this cost without an allocation
profile showing it on a hot path.
