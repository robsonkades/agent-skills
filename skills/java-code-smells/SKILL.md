---
name: java-code-smells
description: >
  The detection catalogue for Java code smells: Long Method, God Object, Feature Envy,
  Primitive Obsession, Data Clumps, Shotgun Surgery, Divergent Change, Mysterious Name,
  Mutable and Global Data, Data Class, Loops, Lazy Element, Refused Bequest, boolean
  blindness, null-heavy APIs and leaky abstraction, plus how modern Java changes the list
  and the routing table from a finding to the refactoring that fixes it. Use when auditing
  code for structural problems, before planning a refactoring, when one change keeps fanning
  out across many files, when several refactorings could address one finding, when a switch
  over a sealed type carries a default branch, or when deciding whether a suspect pattern is
  actually a problem. Detection and severity only — refactoring mechanics are
  java-refactoring, navigation-chain depth is java-law-of-demeter, and the economics of
  duplication and premature abstraction are java-dry-kiss-yagni.
---

# Java Code Smells

## Purpose

A smell is evidence, not a verdict. This skill runs a detection pass whose output is a
short, prioritised list of findings — each with the code it names, the evidence, a
severity argument, and the java-refactoring technique that addresses it. The failure
modes it prevents: reporting everything pattern-matching a smell (noise the team
ignores), and rewriting code during what was supposed to be a diagnosis.

## Workflow

1. **Scan for signals, not smells.** Size outliers (methods, classes, parameter lists),
   change history (`git log --follow` on files that appear in every PR), duplication,
   and dependency fan-in/fan-out. Signals say where to look; the catalogue says what
   you found.
2. **Classify against the catalogue** — read `references/catalogue-within.md` for
   findings inside one class, `references/catalogue-between.md` for findings about
   coupling between classes. Check the smell's false positives before recording it.
3. **Weigh severity as blast radius × change frequency.** A smelly method touched by
   every second PR outranks a monstrous one nobody has edited in two years. Use the
   repository history as evidence, not aesthetics.
4. **Record findings, do not fix them.** Each finding: smell name, location, evidence,
   severity argument, the named java-refactoring technique — routed through
   `references/smell-to-refactoring.md`, which also says what decides between competing
   techniques and when the honest recommendation is no refactoring. Fixing happens in a
   separate pass under that skill's safety workflow.

## Rules

- No finding without evidence a reviewer can check: a metric, a diff that fanned out, a
  duplicated block's two locations. "This looks wrong" is not a finding.
- Stable code is presumed innocent: if it has not changed in a year and has no open
  defects, report at most a note, whatever it looks like.
- One structural cause often shows as several smells (a God Object produces Feature
  Envy in its neighbours and Shotgun Surgery in its callers). Report the cause once,
  not each symptom separately.
- An exhaustive `switch` over a sealed type with no `default` is not the Switch
  Statements smell — it is one of its fixes. Read `references/modern-java.md` before
  flagging any switch, record, or Optional usage.
- A comment apologising for code ("hack", "careful here", a paragraph explaining a
  block) marks a smell site — treat the comment as the detector, not the problem.
- Never bundle a fix into the detection pass. Detection changes no code.

## References

- [Catalogue: within a class](references/catalogue-within.md) — Long Method, Large
  Class, Primitive Obsession, Data Clumps, Temporary Field, Duplicate Code, Dead Code,
  comments-as-deodorant, boolean blindness, Speculative Generality, Mysterious Name,
  Long Parameter List, Mutable Data, Loops, Lazy Element.
- [Catalogue: between classes](references/catalogue-between.md) — Feature Envy,
  Shotgun Surgery, Divergent Change, Message Chains, Middle Man, Refused Bequest,
  Inappropriate Intimacy, Switch Statements, null-heavy APIs, leaky abstraction, Global
  Data, Alternative Classes with Different Interfaces, Data Class.
- [Smell → refactoring](references/smell-to-refactoring.md) — the routing table from a
  recorded finding to the java-refactoring techniques that address it, what decides
  between competing techniques, the sequences that must run in order, and when the
  correct output is no refactoring at all. Read at step 4, when turning findings into
  recommendations.
- [Modern Java: dissolved and created smells](references/modern-java.md) — what
  records, sealed types and Optional removed from the classic catalogue and what they
  added. Read before flagging switches, records, or Optional chains.
- [A worked smell pass](references/worked-pass.md) — one realistic service audited end
  to end: signals, findings, severity weighing, and the false positive that was
  deliberately not reported. Read when unsure how to weigh or phrase findings.
