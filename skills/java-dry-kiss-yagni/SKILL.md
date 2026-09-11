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
together because they state the same domain rule or technical contract. Code that merely looks
the same but represents independently changing rules is incidental; merging it couples those
policies. Separate teams or release schedules can still implement one explicitly shared contract.

## Workflow

0. **Establish the target and authority.** Inspect compiler release/toolchains, callers,
   published APIs, resource/failure contracts, tests and change history; identify who owns
   the rule and its effective version/date.
   Examples use Java 17-compatible syntax (records need Java 16+ without preview); on older
   targets use existing classes, without an implicit upgrade. If authority or caller behavior
   is unknown, document the gap and defer a merge that would silently decide policy.
1. **Classify the duplicated knowledge, not whole fragments.** Enumerate change reasons. If a
   subset must change together under one authority, extract that nucleus while leaving
   independently varying policy separate. Similar fragments need not be all-shared or all-
   incidental. Read [references/decision-heuristics.md](references/decision-heuristics.md).
2. **Price the abstraction that would remove it.** Every caller becomes coupled to the
   shared code, and to each other through it. Count the parameters — especially booleans —
   the merged version needs to serve all callers today. A flag encoding caller identity or
   unrelated policy is a warning; an explicit domain policy such as `RoundingMode` can be a
   legitimate parameter.
3. **Decide.**
   - Knowledge duplication → centralize the authoritative rule where release/ownership
     constraints permit, with mechanics from java-refactoring; otherwise share specification
     and conformance tests while retaining necessary execution points.
   - Incidental duplication → leave it.
   - An existing abstraction whose callers fight it → compare a narrower shared core or
     clearer entry points with inlining and re-extracting only the shared knowledge. Preserve
     supported APIs through the applicable migration/compatibility policy; a costly split
     need not beat retaining adequate code. Read [references/worked-examples.md](references/worked-examples.md)
     when performing either operation.
4. **Verify.** After a merge, rule tests cover meaningful boundaries and consumer tests
   confirm each caller selects the right policy/version. Remove caller-identity flags, not
   legitimate domain inputs. After an inline, preserve each supported caller's behavior while
   removing branches used only by others. Report any policy change separately.

## Rules

- Duplication and wrong abstractions have different failure costs; compare impact and rollback
  rather than assuming one is always worse. When unsure, keep duplication and reconsider on the third
  occurrence, once the copies have demonstrably changed together. The rule of three is a
  heuristic, not a law: for money, authorization or regulated rules, establish one authority
  early, but verify that contexts actually share the rule and effective version before merging.
  Independently owned bounded-context models should remain separate; intentional shared
  contracts need explicit governance and compatibility checks.
- A boolean/mode added because "caller A behaves differently" is a wrong-abstraction signal.
  Split caller-specific policy; retain parameters that are genuine input to one coherent
  operation and are named as domain choices rather than implementation branches.
- Build for the requirement that exists. A type parameter with one instantiation, a config
  point never configured differently, or a hook nobody calls is a signal to investigate,
  not proof of speculative generality. Check test seams, external users and planned work
  before removing it. (Its detection as a
  smell lives in java-code-smells.)
- Separate essential from accidental complexity before "simplifying". Code implementing a
  genuinely intricate rule is not a KISS violation; indirection the problem does not
  require is. Deleting essential complexity moves it into callers or into production
  incidents — it does not remove it.
- KISS ranks the designs that meet the requirement; it never justifies missing it.

## Deliverable

State the shared knowledge (or independent change reasons), evidence/authority, chosen boundary
and main cost. For changes, list preserved behavior, deliberate policy changes and checks
actually executed. Missing history is uncertainty, not evidence that future flexibility is useful
or useless; keep conclusions proportionate to the available caller and requirement evidence.

## Safety and production constraints

- One source of truth does not mean one execution point. Authorisation policy can be centralized
  while checks occur at gateway and protected operation; validation can repeat structural
  constraints at independently trusted boundaries. Remove duplicated **decisions**, not defense
  in depth.
- Never centralise context-sensitive output encoding or "sanitisation" behind a generic helper.
  HTML, SQL, shell, LDAP and log sinks have different grammars; parameterization/contextual
  encoding belongs at the sink.
- Shared code creates a release and incident blast radius. Before merging across modules/teams,
  define owner, compatibility policy, rollout order and rollback. A shared library that deploys
  at different cadences can increase live version skew even while deleting source duplication.
- Performance duplication may be intentional specialization. Identify the behavior and budget
  that must survive a merge. Use relevant representation/compiler evidence for layout or
  inlining/vectorization claims, and representative measurements for allocation/performance
  requirements; a CPU profile alone proves neither. Reuse adequate evidence, or leave preservation
  unverified and retain separate implementations/shared contracts. java-performance owns a
  deeper performance investigation when needed.

## References

- [Decision heuristics and false positives](references/decision-heuristics.md) — tests for
  knowledge versus incidental duplication, the wrong-abstraction and speculative-generality
  signatures, the cost model, and the cases that look like violations but are correct.
  Read before merging or inlining anything.
- [Worked examples](references/worked-examples.md) — one inlining of a wrong abstraction
  back into duplicates, one merge of genuine knowledge duplication, each with trade-offs
  and verification. Read when performing either operation.
