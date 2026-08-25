---
name: java-clean-code
description: >
  Readability and intention-revealing structure in Java: method and class sizing —
  including the point where splitting becomes harmful fragmentation — abstraction
  levels within a method, comments, hidden side effects, temporal coupling and
  hidden dependencies. Use when reviewing or refactoring for clarity, when a method
  has grown past comprehension or a class has shattered into fragments that only
  make sense together, or when callers must know an unwritten call order. Does not
  cover naming and API shape (java-api-design), the smell catalogue
  (java-code-smells), exception handling (java-exception-design) or null handling
  (java-null-safety).
---

# Java Clean Code

## Purpose

Make Java code that the next reader understands without running it. Two failure modes,
not one: the method that does five things, and the class exploded into a dozen
three-line fragments that communicate through fields and can only be understood by
reading all of them. Both are unreadable; only the first is commonly named. This skill
decides where to split, where to merge, and when to leave code alone.

Readability yields to correctness always, and to performance only with a measurement
attached — a profile or benchmark, recorded in a comment at the site.

## Workflow

1. State what the unit does in one sentence. Every "and", "then" or "unless" in that
   sentence is either a split point or evidence that the unit is coherent and only its
   name is wrong (naming is java-api-design's).
2. Check each method for abstraction level: does it mix policy ("apply the fee rule")
   with mechanics (rounding, string assembly, iteration bookkeeping)? Extract the
   mechanics under a domain name; keep the policy visible.
3. Check for hidden structure: ambient reads (`now()`, locale, static config) inside
   logic, fields used as scratch space between calls, methods valid only in a fixed
   order. Make dependencies parameters and make order impossible to get wrong.
4. Only then weigh size — count the concepts a reader must hold at once, not lines.
   A 30-line method at one abstraction level beats ten 3-line hops.
5. Re-run the tests. A change that alters behaviour is not a readability change; the
   safety workflow and mechanics for larger moves live in java-refactoring.

## Rules

- One abstraction level per method: it either orchestrates named steps or implements
  one step. A method that does both reads as noise even at ten lines.
- Every extraction has a price — a name to trust and a hop to follow. Do not keep a
  fragment that has one caller, needs fields or three-plus parameters to share state
  with that caller, and cannot be understood without reading it. Inline it back.
- A method that needs comments to separate its sections is several methods. A comment
  explains _why_; a comment that explains _what_ marks code that needs changing.
- A method whose name promises a read must not write. Callers reorder and drop calls
  to "getters"; a mutation hidden in one corrupts state at a distance. (Command–query
  separation in full is java-tell-dont-ask's.)
- No unenforced call order: if `b()` is only valid after `a()`, merge them, pass what
  `b` needs as the return of `a`, or encode the order in a type. A Javadoc line saying
  "call a() first" is a defect scheduled for later.
- No ambient reads in domain logic: `LocalDate.now()`, `Locale.getDefault()`, static
  configuration lookups belong at the boundary, passed in as `Clock`, `Locale`,
  values. Hidden inputs make behaviour untestable and irreproducible.

## References

- [Worked examples](references/worked-examples.md) — an under-factored settlement
  method split by abstraction level, and an over-fragmented batch processor merged
  back, each with trade-offs and verification. Read before splitting or merging
  anything larger than a single method.
- [Structure and coupling](references/structure-and-coupling.md) — detection
  heuristics, false positives and when-not-to-apply for abstraction levels, temporal
  coupling and hidden dependencies. Read when a rule above matches but the fix is not
  obvious, or the match might be a false positive.
