# Catalogue: coupling smells between classes

Same format as `catalogue-within.md`. These smells are about where behaviour and knowledge
live relative to the data they concern.

## Feature Envy

- **Looks like:** a method whose body is mostly `other.getX()` calls, computing something
  from another object's data — fee calculation in a service reading five accessors of
  `Merchant`.
- **Detect:** count references per method to foreign data versus own state; a method
  touching one foreign object more than `this` is a candidate.
- **Not it when:** deliberate separations — mappers, serialisers, and read-side
  projections _exist_ to read another object's data. A record's data being read
  everywhere is its job.
- **Fix:** Move Method to the envied class; Extract Method first when only part of the
  method envies.

## Shotgun Surgery

- **Looks like:** one conceptual change — "add a payment method" — edits seven files
  every time.
- **Detect:** change history, not code shape: recurring co-change sets in `git log`.
  Ask "what did the last three such changes touch?"
- **Not it when:** the fan-out is one mechanical registration point per layer (a new
  case, a new adapter) and each edit is compiler-guided — a sealed hierarchy makes the
  compiler enumerate exactly these sites, which is fan-out made safe.
- **Fix:** Move Method / Move Field to gather the scattered concept; Introduce
  Factory/Strategy so new variants register in one place.

## Divergent Change

- **Looks like:** the mirror image — one class edited for many unrelated reasons: tax
  rules on Monday, retry policy on Tuesday, formatting on Friday.
- **Detect:** change history of a single file spans unrelated ticket types; the class
  imports from several unrelated domains.
- **Not it when:** a composition root or configuration class — its single responsibility
  _is_ wiring everything, so it changes with everything.
- **Fix:** Extract Class along the reasons for change.

## Message Chains

- **Looks like:** `order.customer().account().manager().email()` — logic navigating a
  structure and coupling to every hop.
- **Detect:** dots crossing _object boundaries with distinct owners_, not dot count.
- **Not it when:** fluent builders and streams (one designed API, not navigation), or
  chains within one aggregate of records built for destructuring. Depth on the
  distinction is java-law-of-demeter's.
- **Fix:** Extract Method + Move Method so the owner answers the question; add the
  query the caller actually needs.

## Middle Man

- **Looks like:** a class whose methods all delegate one-for-one to a field; wrappers
  wrapping wrappers.
- **Detect:** more than half the public methods are single-line delegations adding no
  behaviour, translation or invariants.
- **Not it when:** the wrapper is a boundary on purpose: an anti-corruption layer, a
  port implementation, a facade narrowing a wide API, or a Demeter-driven wrapper that
  actually changes the contract.
- **Fix:** Inline Class; let callers hold the real collaborator. (Wrapper explosion as a
  Demeter failure mode is java-law-of-demeter's topic.)

## Refused Bequest

- **Looks like:** a subclass overriding inherited methods to throw
  `UnsupportedOperationException`, or ignoring most of what it inherits;
  `ReadOnlyRepository extends CrudRepository` refusing `save`.
- **Detect:** overrides that throw or no-op; subclass uses a small fraction of the
  parent's surface.
- **Not it when:** a documented partial implementation contract the platform itself
  defines (e.g. immutable implementations of mutable collection interfaces) — still a
  cost, but a chosen one, not an accident.
- **Fix:** Replace Inheritance with Composition; or push the refused members down so the
  supertype promises only what all subtypes honour.

## Inappropriate Intimacy

- **Looks like:** two classes reading each other's fields, bidirectional references,
  package-private access used as a back channel, tests reaching into another class's
  internals.
- **Detect:** mutual imports; one class breaking when the other's _private_ structure
  changes.
- **Not it when:** an aggregate root and its interior parts — the intimacy is inside one
  consistency boundary and the interior is not public.
- **Fix:** Move Method/Field to put behaviour with data; Encapsulate Collection; make one
  direction of the relationship the owner.

## Switch Statements (pre-sealed)

- **Looks like:** the same `switch`/`if-else` over a type tag or enum repeated in several
  places — pricing here, validation there, rendering elsewhere — each new variant means
  finding them all.
- **Detect:** two or more switches over the same discriminator in different classes;
  a `default` arm doing "nothing" so new variants pass silently.
- **Not it when:** a single exhaustive switch over a sealed type or enum with no
  `default` — the compiler finds every site when a variant is added. See
  `modern-java.md` before flagging any switch.
- **Fix:** Replace Conditional with Polymorphism, or with sealed + exhaustive switch —
  the choice between them is java-refactoring's decision table.

## Null-heavy APIs

- **Looks like:** methods returning null for "not found", null-accepting parameters
  meaning "default", callers wrapped in `if (x != null)` pyramids; `Map<String,Object>`
  payloads where half the values may be null.
- **Detect:** grep call sites for immediate null checks; a return type whose absence
  case is undocumented.
- **Not it when:** internal hot paths with a documented non-null contract
  (`@NullMarked` scope), or platform APIs you merely consume.
- **Fix:** detection only here — contracts and fixes are java-null-safety's; Optional as
  a return type is java-optional's.

## Excessive / leaky abstraction

- **Looks like:** an interface per class, a `Repository` whose methods take SQL
  fragments, a "generic" event bus where every consumer casts payloads, layers that
  each add one prefix to a call.
- **Detect:** leak — callers must know the concrete implementation to use the
  abstraction correctly (they catch its specific exceptions, pass its specific hints).
  Excess — removing the layer changes no caller except an import.
- **Not it when:** the indirection is a real seam: a second implementation exists, or
  the boundary isolates a volatile dependency.
- **Fix:** Inline Class / collapse layers; for the leak, redesign the contract so
  callers depend only on it (boundary design is java-api-design's).

## Global Data

- **Looks like:** `public static` mutable fields, a singleton with setters,
  `System.setProperty` in business code, a static mutable `Map` used as a cache, a
  `ThreadLocal` carrying ambient request state.
- **Detect:** the set of modification points is unbounded — search for writes and they are
  everywhere. Corroborate from the tests: they need a reset between runs, or they pass
  alone and fail together.
- **Not it when:** immutable constants; a stateless container-managed singleton; a
  request-scoped value carried deliberately (scoped-values). Static is not the smell;
  static **and mutable and reachable from anywhere** is.
- **Fix:** Encapsulate Variable first — one access point is the precondition for every
  other move — then narrow the scope, or inject the value.

## Alternative Classes with Different Interfaces

- **Looks like:** two classes doing the same job with different method names and shapes;
  two vendor adapters whose surfaces diverged; callers holding an `if/else` to pick
  between them.
- **Detect:** you can describe both in one sentence without an "and"; call sites are
  copy-paste of each other differing only in method names.
- **Not it when:** they genuinely do different things and only rhyme. Unifying those
  produces a lowest-common-denominator interface that fits neither, which is the
  wrong-abstraction failure — java-dry-kiss-yagni owns whether merging pays.
- **Fix:** Change Function Declaration to align the signatures, Move Function to even out
  what each side does, and only then Extract Superclass or a shared interface.

## Data Class

- **Looks like:** fields, getters, setters and nothing else, with every computation over
  those fields living in services around it.
- **Detect:** every method is an accessor, neighbours show Feature Envy toward it, and the
  same derivation over its fields appears in three places.
- **Not it when:** the type is data by design — a DTO at a boundary
  (remote-facade-and-dto), an event payload, or a record modelling a value. The smell is a
  _domain_ class with no behaviour, not any class without behaviour.
- **Fix:** Move Function into it, Encapsulate Collection, Replace Derived Variable with
  Query. If it should stay data, make it a record and stop treating it as a domain object.
