---
name: java-dry-kiss-yagni
description: >
  The economics of duplication and abstraction in Java: knowledge duplication versus
  incidental (textual) duplication, what a shared abstraction costs, the wrong-abstraction
  failure mode, premature abstraction and speculative generality, essential versus
  accidental complexity. Use when deciding whether two similar pieces of code should be
  merged, whether a shared helper should be inlined back into its callers, when a utility
  has grown boolean parameters, or when reviewing code generalised for requirements that do
  not exist. Does not cover the smell catalogue (java-code-smells) or the mechanics of
  extracting and inlining (java-refactoring).
---

# DRY, KISS and YAGNI as Economic Decisions

## Purpose

Decide whether duplication should be merged and whether an abstraction should exist,
treating both as investments with costs — not as rules to obey. The failure mode this
skill prevents is symmetrical: merging two similar-looking methods that encode different
business rules, then feeding the resulting helper boolean parameters until every caller
pays for every other caller's requirements.

DRY is about knowledge, not text. Two fragments are duplicates only if they must change
together because they state the same fact about the domain. Code that merely looks the
same but answers to different rules, owners or schedules is coincidence; merging it buys
coupling, not reuse.

## Workflow

1. **Classify the duplication.** If one copy changes, must the other change for the same
   reason? Yes, for every plausible change → knowledge duplication. No, or only sometimes
   → incidental. Read [references/decision-heuristics.md](references/decision-heuristics.md)
   for the tests and the false positives before answering.
2. **Price the abstraction that would remove it.** Every caller becomes coupled to the
   shared code, and to each other through it. Count the parameters — especially booleans —
   the merged version needs to serve all callers today. Any flag that selects behaviour
   per caller means the callers do not share one piece of knowledge.
3. **Decide.**
   - Knowledge duplication → merge, with the mechanics from java-refactoring.
   - Incidental duplication → leave it.
   - An existing abstraction whose callers fight it — flags, mode enums, callers using
     half of it — → inline it back into the callers, then re-extract only what is
     genuinely shared. Read [references/worked-examples.md](references/worked-examples.md)
     when performing either operation.
4. **Verify.** After a merge: one test pins the rule, and no call site passes a flag to
   select behaviour. After an inline: each caller's copy has lost the branches that only
   served other callers.

## Rules

- Duplication is a cost; the wrong abstraction is a bigger one, because unwinding it means
  touching every caller. When unsure, keep the duplication and merge on the third
  occurrence, once the copies have demonstrably changed together. The rule of three is a
  heuristic for gathering that evidence, not a law: merge two copies of a monetary or
  legal rule immediately, and never merge types across bounded contexts at all.
- A boolean or mode parameter added to a shared method so that one caller behaves
  differently is the wrong-abstraction signature. Do not add the flag; split the method.
- Build for the requirement that exists. A type parameter with one instantiation, a config
  point never configured differently, or a hook nobody calls is speculative generality:
  untested, constraining, and usually wrong when the future arrives. (Its detection as a
  smell lives in java-code-smells.)
- Separate essential from accidental complexity before "simplifying". Code implementing a
  genuinely intricate rule is not a KISS violation; indirection the problem does not
  require is. Deleting essential complexity moves it into callers or into production
  incidents — it does not remove it.
- KISS ranks the designs that meet the requirement; it never justifies missing it.

## References

- [Decision heuristics and false positives](references/decision-heuristics.md) — tests for
  knowledge versus incidental duplication, the wrong-abstraction and speculative-generality
  signatures, the cost model, and the cases that look like violations but are correct.
  Read before merging or inlining anything.
- [Worked examples](references/worked-examples.md) — one inlining of a wrong abstraction
  back into duplicates, one merge of genuine knowledge duplication, each with trade-offs
  and verification. Read when performing either operation.
