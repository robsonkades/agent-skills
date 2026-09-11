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

Feature rework can start with a sentence that entered the plan as a fact but was never established.
It may arrive as a reasonable inference — "they will want this exported too", "the
existing queue is obviously the right one" — and by the time it is contradicted, code depends
on it.

This skill produces one artefact: a ledger that makes the difference between knowing and
guessing visible, so that later phases can be trusted to know which is which.

## Workflow

1. **Read the request literally.** Write down what it says, in its own words, before
   interpreting it. Quote only the material phrases; interpretation is a separate line.
2. **Split every statement into one of four classes.** Facts, assumptions, unknowns, decisions
   — the classification rules are below and the entry format is in
   `references/ledger-format.md`.
3. **Give every fact a source.** A file path with a line, a command and its output, or the
   message the user actually sent. A claim with no supporting evidence stays unresolved;
   classify it as an assumption only if provisionally adopted. Record relevant revision/environment/time and the scope the source
   supports; code or a comment is not proof of current production behaviour.
4. **Give every assumption a falsifier.** What observation would show this is wrong? An
   assumption nobody can contradict is not an assumption, it is a hidden requirement.
5. **Give every unknown an impact.** HIGH, MEDIUM or LOW, defined by what changes if the answer
   turns out to be the other one — not by how interesting the question is.
6. **Name the ambiguities separately.** An ambiguity is a phrase with two readings that lead to
   different work. Record both readings; do not choose.
   Check for consequential omissions in who can trigger or observe the outcome, effects on
   existing data, and repeated or partly failed operations. Record only plausible in-scope gaps
   and their consequences; an omitted answer does not authorize adding a requirement.
7. **State the expected outcome** in observable terms: what a user, an operator or a caller can
   do after this feature exists that they cannot do now. Trace it to stated intent; if missing,
   record the gap rather than inventing a goal or acceptance criterion.
8. **Preserve input identity and authority.** Name the Product/Engineering or Tech Feature revision
   being examined. A decision records its accountable role; the current participant is not
   automatically its owner.
9. **Check the ledger before handoff.** Resolve duplicate entries, preserve conflicting
   sources as separate scoped claims, and verify every impact/falsifier is meaningful. Reuse
   authority and answers already established in the supplied context; missing lifecycle IDs
   do not prevent a provisional ledger with source links and explicit unmapped items.

## The four classes

| Class          | Test                                                  | Must carry             |
| -------------- | ----------------------------------------------------- | ---------------------- |
| **FACT**       | Supplied evidence establishes this scoped proposition | Source and scope       |
| **ASSUMPTION** | An unverified interpretation is provisionally used    | Basis and falsifier    |
| **UNKNOWN**    | Available context does not establish an answer        | Consequence and impact |
| **DECISION**   | A choice is proposed or has a recorded outcome        | Owner, source, status  |

Classify each atomic proposition, splitting compound sentences. "The user requested X" can
be a fact while "X already works in production" remains unknown. A proposed decision stays
proposed until its authority/status is evidenced; do not imply confidence merely because
an interpretation is convenient. A sourced claim may later be superseded or disproved.

## Decision rules

```text
IF a statement came from the user's message
THEN it is a FACT about the request, sourced to that message —
     but a claim inside it about the system is only a fact once checked.

IF evidence describes the current implementation
THEN record the scoped observation; it does not by itself establish what the feature must do.

IF a supplied policy, contract or decision establishes a constraint
THEN cite its authority, applicable scope and revision. An accepted repository artefact can
     establish a requirement; its storage location alone does not make it authoritative.

IF the request uses "should", "probably", "I think" or "we usually"
THEN interpret its role: "the API should reject duplicates" can state desired behaviour;
     "it probably already rejects them" is an unverified system claim. Preserve the wording
     and authority instead of classifying by a keyword alone.

IF a target is vague ("fast", "high volume", "soon") or lacks relevant units/window/basis
THEN preserve the stated goal and record its missing threshold/unit/window as UNKNOWN;
     do not invent a measurable acceptance condition.

IF plausible answers change no material behaviour, acceptance, security, operation or design
THEN its impact may be LOW; explain the consequence rather than guessing from code scope.

IF a phrase has two readings that produce different work
THEN it is an ambiguity: record both readings and stop resolving it here.
```

## Constraints

- **Never promote an assumption by repetition.** A statement restated in the plan is still the
  assumption it was in the ledger, and the plan must say so.
- **Do not answer unknowns here.** Closing them from the repository belongs to the context
  phase; asking about them belongs to the clarification phase. Incorporate answers and evidence
  already supplied without pretending they require rediscovery, and label their provenance.
- **Keep material uncertainty visible.** Merge duplicates and omit unrelated speculation;
  do not hide an inconvenient issue because it is low priority. Impact classification is
  not a decision about question order or whether a gap may be accepted.

## Output

```text
Feature            <name, in the domain's words>
Problem            <what is wrong or absent today>
Goal               <what becomes possible>
Facts              <each with source>
Assumptions        <each with falsifier>
Unknowns           <each with impact HIGH | MEDIUM | LOW>
Decisions          <owner, source and proposed/accepted/superseded status>
Constraints        <request or applicable accepted policy/contract/decision; source and scope>
Dependencies       <systems, teams or work this feature waits on>
Ambiguities        <phrase, reading A, reading B>
Expected outcome   <observable>
Input revisions    <Product/Engineering or Tech Feature revision IDs>
Accepted gaps      <GAP-* or none; never convert an unknown silently>
```

Preserve original entries and identifiers while recording dated resolutions, corrections and
supersession. Keep the current status easy to find, with links to the supporting revision;
history must remain available without making stale claims look current. Hand off material
unknowns to context/clarification without solving or prioritizing them here.
