---
name: java-clean-code
description: >
  Readability and intention-revealing structure in Java: method and class sizing — including
  the point where splitting becomes harmful fragmentation — abstraction levels within a
  method, comments, hidden side effects, temporal coupling and hidden dependencies. Use when
  reviewing or refactoring for clarity, when a method has grown past comprehension or a
  class has shattered into fragments that only make sense together, or when callers must
  know an unwritten call order. Does not cover naming and API shape (java-api-design), the
  smell catalogue (java-code-smells), exception handling (java-exception-design) or null
  handling (java-null-safety).
---

# Java Clean Code

## Purpose

Make Java code that the next reader understands without running it. Two failure modes,
not one: the method that does five things, and the class exploded into a dozen
three-line fragments that communicate through fields and can only be understood by
reading all of them. Both are unreadable; only the first is commonly named. This skill
decides where to split, where to merge, and when to leave code alone.

Readability yields to correctness always, and to performance only with evidence. Keep the
reproducible benchmark/profile and environment in the performance record; leave a short code
comment only when a future maintainer could reasonably "simplify" a still-measured hot path.

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

## Split, keep or merge

| Evidence                                                               | Default decision                                | Why                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Policy and mechanics are interleaved; a block has a stable domain name | Extract the mechanics                           | The orchestration becomes the readable policy                        |
| Linear code has one level, one lifecycle and few live concepts         | Keep it together                                | Line count alone does not pay for navigation                         |
| Helpers communicate through mutable fields or wide parameter bundles   | Merge or introduce one explicit state value     | Fragmentation hid the data flow and often created reentrancy defects |
| A branch is a distinct volatile policy with independent tests/owners   | Extract a policy object or function             | Change coupling, not size, justifies the boundary                    |
| Performance evidence requires an unusual shape                         | Keep the measured shape and record the evidence | Readability must not erase a demonstrated constraint                 |

## Rules

- One abstraction level per method: it either orchestrates named steps or implements
  one step. A method that does both reads as noise even at ten lines.
- Every extraction has a price — a name to trust and a hop to follow. Do not keep a
  fragment that has one caller, needs fields or three-plus parameters to share state
  with that caller, and cannot be understood without reading it. Inline it back.
- Section comments are a diagnostic, not a verdict. Stable domain steps often deserve named
  extractions; a dense algorithm, state machine or intentionally co-located hot loop may be
  clearer with phase/invariant comments. A comment that merely paraphrases syntax is noise;
  one that preserves rationale, invariant, units, protocol or measured constraint is design
  evidence.
- A method whose public contract promises an observational read must not expose a semantic
  write. Internal memoisation may be acceptable when it preserves results, thread safety,
  resource bounds and failure behavior; lazy I/O or externally visible mutation is not a
  harmless getter implementation. (Command–query separation in full is
  java-tell-dont-ask's.)
- No unenforced call order: if `b()` is only valid after `a()`, merge them, pass what
  `b` needs as the return of `a`, or encode the order in a type. A Javadoc line saying
  "call a() first" is a defect scheduled for later.
- No ambient reads in domain logic: `LocalDate.now()`, `Locale.getDefault()`, static
  configuration lookups belong at the boundary, passed in as `Clock`, `Locale`,
  values. Hidden inputs make behaviour untestable and irreproducible.

## Production checks

- **Concurrency:** extraction that promotes locals to fields can make a previously reentrant
  operation race. Run concurrent calls when a refactor changes state lifetime; `final` on the
  field does not make the referenced accumulator safe.
- **Failure atomicity:** moving an effect into a helper does not make a workflow transactional.
  List effects and retry boundaries before rearranging persistence, messages or remote calls.
- **Observability:** preserve event names, correlation and error classification. Do not retain
  logs merely to narrate newly fragmented control flow.
- **Compatibility:** reflection, dependency injection, serialization and framework proxies may
  observe constructors, visibility and annotations that ordinary callers do not. An internal
  readability edit can still be a runtime contract change.
- **Reviewability:** separate semantic movement from renaming/formatting when practical. A
  smaller conceptual diff makes behavior preservation easier to establish than a lower line
  count does.

## References

- [Worked examples](references/worked-examples.md) — an under-factored settlement
  method split by abstraction level, and an over-fragmented batch processor merged
  back, each with trade-offs and verification. Read before splitting or merging
  anything larger than a single method.
- [Structure and coupling](references/structure-and-coupling.md) — detection
  heuristics, false positives and when-not-to-apply for abstraction levels, temporal
  coupling and hidden dependencies. Read when a rule above matches but the fix is not
  obvious, or the match might be a false positive.
