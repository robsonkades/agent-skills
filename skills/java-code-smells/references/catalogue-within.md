# Catalogue: smells within a class

Each entry: what it looks like in modern Java, how to detect it, what falsely
pattern-matches it, and which java-refactoring technique addresses it (named, not taught).

## Long Method

- **Looks like:** one method mixing validation, computation, branching policy and I/O;
  locals reused for different purposes; blank-line "paragraphs".
- **Detect:** you cannot state what it does in one sentence without "and"; a reader must
  track more than a handful of live locals; sections are separated by comments.
- **Not it when:** a linear sequence at one abstraction level with no branching — a long
  mapper or assertion-rich test reads best inline. Length alone is not the smell.
- **Fix:** Extract Method along abstraction levels; Decompose Conditional; Replace
  Conditional with sealed + switch when length comes from type dispatch.

## Large Class / God Object

- **Looks like:** a `*Service`/`*Manager` imported by everything, with field groups used
  by disjoint method groups; every feature branch edits it.
- **Detect:** cluster fields by which methods use them — two or more disjoint clusters is
  the evidence. Corroborate with change history: it appears in most PRs.
- **Not it when:** a cohesive class that is merely big — one field cluster, one reason to
  change. A 400-line parser can be healthy.
- **Fix:** Extract Class per field cluster; Move Method toward the extracted data.

## Primitive Obsession

- **Looks like:** `String cpf`, `String currency`, `long cents`, `String status` flowing
  through signatures; the same format-validation repeated at each entry point.
- **Detect:** a primitive with rules (validation, arithmetic constraints, formatting)
  enforced somewhere other than a type; two parameters that must agree (`amount`,
  `currency`) travelling separately.
- **Not it when:** the primitive has no rule _and_ cannot be confused with another concept
  of the same type — a free-text note, a count used only locally. Wrapping every `int` is
  ceremony, not modelling.
- **Budget:** a wrapper earns its place if it passes one of two tests — _confusion_: could
  this value be passed to a parameter expecting a different concept of the same primitive
  (`String customerId` into a `String orderId` slot)? — or _rule_: does it carry validation,
  arithmetic constraints or formatting? Neither, and the type is a rename with allocation.
  Each wrapper costs a file, a serialiser or `@JsonValue`, an `AttributeConverter` and a
  mapper entry, and its call sites drift towards `getValue()` at every use, which is the
  wrapper undone. Wrappers can add allocation/serialization/mapping cost, although HotSpot may
  eliminate short-lived allocations; measure performance-sensitive paths rather than assuming
  either outcome. Forty one-line wrappers that satisfy neither test prevent nothing (Lazy
  Element, below).
  When a reviewer disputes the confusion test, run `scripts/primitive-obsession/verify.sh`:
  untyped, the transposed call runs and exits 0; typed, `javac --release 21` rejects it with
  `incompatible types: CustomerId cannot be converted to AccountId`.
- **Fix:** Replace Type Code (enum or sealed hierarchy); wrap in a record with a
  validating compact constructor.

## Data Clumps

- **Looks like:** `LocalDate start, LocalDate end` or `String street, String city, String
zip` recurring together across signatures.
- **Detect:** delete one of the group — if every use site breaks, they are one concept.
  Repeated co-travel, ordering/confusion risk and a shared invariant are stronger evidence than
  any fixed parameter or occurrence count.
- **Not it when:** the values co-occur once, or only inside one private method chain.
- **Fix:** Introduce Parameter Object with a record; the invariant between them (end not
  before start) moves into the compact constructor.

## Temporary Field

- **Looks like:** fields null except during one operation; a `reset()` method; "phased"
  objects that must be initialised before use.
- **Detect:** a field written and read only within one call flow; constructor leaves it
  null; tests must call methods in order.
- **Not it when:** lazily computed caches with a defined empty state, or lifecycle fields
  a container manages.
- **Fix:** demote to locals via Extract Method; or Introduce Parameter Object carrying
  the in-flight state. (The temporal-coupling analysis lives in java-clean-code.)

## Duplicate Code

- **Looks like:** copy-paste blocks with a variable renamed; parallel `if` arms differing
  in one operand; the same mapping written in three adapters.
- **Detect:** search for a distinctive literal or expression, then use co-change and defect
  history to ask whether the occurrences encode one decision. Two copies of volatile knowledge
  can already be harmful; ten coincidentally similar adapters can be independent.
- **Not it when:** the duplication is incidental — same shape today, different reasons to
  change. Whether merging pays is java-dry-kiss-yagni's call; only its detection is here.
- **Fix:** Extract Method / Extract Class; for parallel conditional arms, Consolidate via
  Decompose Conditional.

## Dead Code

- **Looks like:** unused private methods, unreachable branches, commented-out blocks,
  feature-flag arms for flags that shipped, `@Deprecated` items with no external callers.
- **Detect:** compiler and IDE inspections for private scope; for public scope, search
  callers — reflection, serialisation and framework wiring first.
- **Not it when:** public API kept for compatibility (that is java-api-design's
  deprecation policy), or entry points invoked reflectively by a framework.
- **Fix:** delete it. Version control is the archive; there is no other technique.

## Comments as deodorant

- **Looks like:** a paragraph explaining what a block does; "careful", "hack", "don't
  touch"; a comment restating the next line.
- **Detect:** the comment merely restates syntax while the code hides its intent. Why-comments
  (constraints, invariants, units, protocols, workarounds with links, measurements) are healthy;
  phase comments in a dense algorithm can also be clearer than forced extraction.
- **Not it when:** Javadoc on a public contract, licence headers, or a why-comment.
- **Fix:** Extract Method named after the comment; Rename until the comment is
  redundant; keep only the why.

## Boolean blindness

- **Looks like:** `process(order, true, false)`; a `boolean` field meaning three things
  in combination with another; `isActive` flags encoding a state machine.
- **Detect:** a call site unreadable without opening the signature; two booleans with
  only three legal combinations.
- **Not it when:** a genuinely two-valued property named clearly at the call site
  (`withRetries(true)` in a builder is fine).
- **Fix:** Replace Type Code with an enum or sealed hierarchy; two-element enums make
  call sites self-describing.

## Speculative Generality

- **Looks like:** interfaces with one implementation, `AbstractBase*` with one subclass,
  type parameters never bound to a second type, hooks nobody calls, config for values
  that never vary.
- **Detect:** search for second users — implementations, subclasses, callers — and identify the
  boundary the abstraction protects. One implementation is a signal, not sufficient evidence:
  an owned port, substitutable test seam or published interface may be valuable without a
  production twin.
- **Not it when:** the seam is load-bearing for testing or module boundaries, or the
  second implementation genuinely exists on a roadmap with a date. The economics are
  java-dry-kiss-yagni's; detection is here.
- **Fix:** Inline Class / Collapse the hierarchy; delete unused parameters and hooks.

## Mysterious Name

- **Looks like:** `data`, `info`, `process()`, `handle()`, `*Manager`, `*Helper`; a name
  describing the implementation (`customerStringList`) or the pattern
  (`OrderStrategyImpl`) instead of the role; a name that lies — `validate()` that also
  saves.
- **Detect:** you must read the body to know what it does; the name and its Javadoc
  disagree; the name uses a word the domain glossary does not; two names exist in the
  codebase for one concept.
- **Not it when:** an established domain term that outsiders find opaque is exactly right
  (`settlement`, `netting`, `dunning`). Short names in a two-line scope are fine.
- **Fix:** Rename — the highest value per unit of risk in the catalogue. If no name fits,
  that is the finding: the thing has more than one responsibility, so Extract first and
  name the pieces.

## Long Parameter List

- **Looks like:** many independent parameters; the same group recurring across signatures;
  booleans among them; a parameter only forwarded to another call.
- **Detect:** the call site is unreadable without opening the signature; two adjacent
  parameters share a type, so a swapped pair still compiles; a parameter the body never
  reads on its own. Count is a locator, not the definition.
- **Not it when:** a record's canonical constructor with eight components — that is the
  data, not a parameter list. Nor a DI constructor with five collaborators: that is Large
  Class, and counting parameters points at the wrong fix.
- **Fix:** Introduce Parameter Object for the co-travelling group; Preserve Whole Object
  where the caller already holds one; Remove Flag Argument for the booleans; Replace
  Parameter with Query for the derivable ones.

## Mutable Data

- **Looks like:** setters on a domain type; a getter handing out the backing collection;
  an object whose state changes far from where it was created; a long-lived object
  written by several collaborators.
- **Detect:** you cannot state the object's state at a given line without tracing every
  holder; two threads reach it; a field participating in `equals`/`hashCode` is written
  after the object entered a `Set` or a `Map` key.
- **Not it when:** mutation contained inside one method, a builder, or an entity whose
  lifecycle is mutation by design. Scope, not mutability, is the smell.
- **Fix:** Encapsulate Variable to get one access point; then Encapsulate Collection,
  Split Variable, Replace Derived Variable with Query, or Change Reference to Value. The
  trade-offs are java-immutability's; visibility across threads is java-memory-model's.

## Loops

- **Looks like:** an index loop performing filter, map or reduce; nested loops building a
  map; a loop carrying a `found` flag and a `break`.
- **Detect:** the body matches one of the standard shapes, and the accumulator needs a
  comment to explain its purpose.
- **Not it when:** the loop exits early with side effects, needs the index, mutates the
  source, or sits on a measured hot path. **This is the most over-applied entry in the
  catalogue** — a `for` loop is not a defect, and a pipeline that needs three lambdas and
  a custom collector is worse than the loop it replaced.
- **Fix:** Split Loop first, so each half has one shape; then convert the halves that
  genuinely read better as pipelines and leave the rest.

## Lazy Element

- **Looks like:** a method whose body is one delegating line, a subclass adding no
  members, an interface with one implementation and an identical signature, a package
  containing one class.
- **Detect:** deleting it changes nothing except the diff; its name restates the thing it
  delegates to.
- **Not it when:** the seam is load-bearing for testing, module boundaries or API
  stability — and, importantly, when a thin type makes an invariant or concept distinction
  checkable. A record wrapping `String` can prevent `CustomerId`/`AccountId` transposition even
  without validation; the difference is demonstrated confusion risk or a rule, not body size.
- **Fix:** Inline Function, Inline Class, Collapse Hierarchy.
