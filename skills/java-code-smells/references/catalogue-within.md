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
- **Not it when:** the primitive has no rules — a free-text note, a count used only
  locally. Wrapping every `int` is ceremony, not modelling.
- **Fix:** Replace Type Code (enum or sealed hierarchy); wrap in a record with a
  validating compact constructor.

## Data Clumps

- **Looks like:** `LocalDate start, LocalDate end` or `String street, String city, String
zip` recurring together across signatures.
- **Detect:** delete one of the group — if every use site breaks, they are one concept.
  Three or more co-travelling parameters in two or more signatures.
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
- **Detect:** search for a distinctive literal or expression; three-plus occurrences of a
  block that would all change together for the same reason.
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
- **Detect:** the comment answers _what_ rather than _why_. Why-comments (constraints,
  workarounds with links, measurements) are healthy and are not this smell.
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
- **Detect:** search for second users — implementations, subclasses, callers. One user
  and no concrete planned second is the evidence.
- **Not it when:** the seam is load-bearing for testing or module boundaries, or the
  second implementation genuinely exists on a roadmap with a date. The economics are
  java-dry-kiss-yagni's; detection is here.
- **Fix:** Inline Class / Collapse the hierarchy; delete unused parameters and hooks.
