---
name: feature-discovery
description: >
  Separating what is actually established about a feature request from what has been filled in:
  a ledger in which every fact carries its source, every assumption carries what would falsify
  it, and every unknown carries the impact of getting it wrong. Use at the start of a feature,
  when a request is one sentence long and the work is not, when a plan or an estimate is being
  built on statements nobody has checked, when two people describe the same feature differently,
  when picking up a feature someone else analysed, or when an answer is about to be written as
  fact because it is probably true. Does not decide which unknowns to ask about or how
  (feature-requirement-clarification), does not investigate the repository to close them
  (feature-context-analysis), and does not restate the requirement without its solution or write
  acceptance criteria (requirements-and-acceptance).
---

# Feature Discovery

## Purpose

Most feature rework traces to a sentence that entered the plan as a fact and was never true.
It usually arrived as a reasonable inference — "they will want this exported too", "the
existing queue is obviously the right one" — and by the time it is contradicted, code depends
on it.

This skill produces one artefact: a ledger that makes the difference between knowing and
guessing visible, so that later phases can be trusted to know which is which.

## Workflow

1. **Read the request literally.** Write down what it says, in its own words, before
   interpreting it. Interpretation is a separate line in the ledger.
2. **Split every statement into one of four classes.** Facts, assumptions, unknowns, decisions
   — the classification rules are below and the entry format is in
   `references/ledger-format.md`.
3. **Give every fact a source.** A file path with a line, a command and its output, or the
   message the user actually sent. A statement with no source is an assumption, however
   confident you are.
4. **Give every assumption a falsifier.** What observation would show this is wrong? An
   assumption nobody can contradict is not an assumption, it is a hidden requirement.
5. **Give every unknown an impact.** HIGH, MEDIUM or LOW, defined by what changes if the answer
   turns out to be the other one — not by how interesting the question is.
6. **Name the ambiguities separately.** An ambiguity is a phrase with two readings that lead to
   different work. Record both readings; do not choose.
7. **State the expected outcome** in observable terms: what a user, an operator or a caller can
   do after this feature exists that they cannot do now.
8. **Preserve input identity and authority.** Name the Product/Engineering or Tech Feature revision
   being examined. A decision records its accountable role; the current participant is not
   automatically its owner.

## The four classes

| Class          | Test                                                 | Must carry            |
| -------------- | ---------------------------------------------------- | --------------------- |
| **FACT**       | Someone can check it right now without asking anyone | Its source            |
| **ASSUMPTION** | You supplied it, and it is probably right            | What would falsify it |
| **UNKNOWN**    | Nobody in this conversation knows it                 | Its impact            |
| **DECISION**   | A choice was made, and an alternative existed        | Owner, source, status |

The classes are exclusive. A statement that is both plausible and unverified is an
ASSUMPTION — the word "obviously" in front of it does not promote it.

## Decision rules

```text
IF a statement came from the user's message
THEN it is a FACT about the request, sourced to that message —
     but a claim inside it about the system is only a fact once checked.

IF a statement came from the repository
THEN it is a FACT about the code, sourced to path:line —
     it is not a fact about what the feature must do.

IF the request uses "should", "probably", "I think" or "we usually"
THEN the statement is an ASSUMPTION even when the user wrote it.

IF a number appears without a unit, a window or a source ("fast", "high volume", "soon")
THEN it is an UNKNOWN, not a requirement.

IF an unknown's two possible answers lead to the same implementation
THEN its impact is LOW — record it and move on.

IF a phrase has two readings that produce different work
THEN it is an ambiguity: record both readings and stop resolving it here.
```

## Constraints

- **Never promote an assumption by repetition.** A statement restated in the plan is still the
  assumption it was in the ledger, and the plan must say so.
- **Do not answer unknowns here.** Closing them from the repository belongs to the context
  phase; asking about them belongs to the clarification phase. Mixing the two loses the
  distinction between what was found and what was told.
- **Do not rank or filter.** A ledger that records only the interesting unknowns cannot be used
  to argue that nothing important is missing.

## Output

```text
Feature            <name, in the domain's words>
Problem            <what is wrong or absent today>
Goal               <what becomes possible>
Facts              <each with source>
Assumptions        <each with falsifier>
Unknowns           <each with impact HIGH | MEDIUM | LOW>
Constraints        <stated by the request; not inferred>
Dependencies       <systems, teams or work this feature waits on>
Ambiguities        <phrase, reading A, reading B>
Expected outcome   <observable>
Input revisions    <Product/Engineering or Tech Feature revision IDs>
Accepted gaps      <GAP-* or none; never convert an unknown silently>
```

Carry the ledger forward unchanged. Later phases append resolutions and stable identifiers; they do
not rewrite it, because
the record of what was unknown at the start is what makes a later surprise explicable.
