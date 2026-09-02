---
name: feature-decision-analysis
description: >
  Keeping the decision log for a feature and, before each entry, answering the two questions
  that make it trustworthy: where the decision came from — the user, the repository, an
  organisational standard or the agent — and whose it was to take. Use when a technology is
  about to be chosen for a feature, when "the project already uses X" is being treated as a
  reason to use X, when a corporate standard is being asserted without a source, when an agent
  is about to commit to a database, a broker, a contract or a security model on its own
  judgement, when a decision taken during implementation contradicts one taken during planning,
  or when nobody can say who decided something. Does not evaluate the options
  (feature-solution-analysis) and does not own the decision-record format, reversibility pricing
  or supersession discipline (architecture-decision-making).
---

# Feature Decision Analysis

## Purpose

The damaging decisions in a feature are rarely the ones someone argued about. They are the ones
that were never noticed as decisions: a broker chosen because it appeared in the build file, a
retention period invented because a number was needed, a "corporate standard" that was one
team's habit.

This skill adds two fields to every decision — **provenance** and **authority** — and refuses
the entry without them. Everything else follows from those two.

## Workflow

1. **Notice the decision.** Anything with a viable alternative is a decision, including the ones
   that feel like defaults. The categories are listed below.
2. **Assign provenance** from the four classes. This is a question of fact and it is checkable
   (`references/provenance-and-authority.md`).
3. **Assign authority** — agent-owned or user-confirmed — from the impact, not from convenience.
4. **If it is user-confirmed and unconfirmed**, it is a blocking question, not a decision.
5. **If it is agent-owned**, take it, state it and move on. Escalating a low-impact decision is
   its own failure: it trains the user to stop reading.
6. **Record it when it is taken**, in the log below. A decision that materially affects
   architecture, behaviour, data, operations, security, performance or reliability also earns a
   record of its own.
7. **When a later discovery contradicts it**, supersede rather than edit. The history is the
   part that has value.

## Provenance — the four classes

| Class                  | Means                                  | Established by                                                                       |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| **USER_MANDATED**      | The user required it                   | Their message, quoted                                                                |
| **CORPORATE_MANDATED** | An organisational standard requires it | The user confirming it, or a document in the repository that says it is the standard |
| **PROJECT_EXISTING**   | The project already does it this way   | `path:line`, with a count                                                            |
| **AGENT_PROPOSED**     | The agent chose it                     | The analysis behind it                                                               |

**The rule the whole skill exists for: PROJECT_EXISTING never promotes itself.** Finding Kafka
in the build file establishes that the project uses Kafka. It does not establish that this
feature must, that the organisation requires it, or that the user wants it. The promotion from
"observed" to "required" is made by a person, and if nobody made it, it did not happen.

The correct move on finding a project technology relevant to the feature:

> The project runs Kafka for shipping events (`pom.xml:104`, two consumers under
> `src/main/java/.../shipping`). Should this feature reuse it, or is the messaging technology
> open?

When the decision is a technology choice — a library, a store, a broker, a protocol, anything new
to run — read `references/technology-questions.md` for the areas where such a choice hides and
for how to ask about one without smuggling the answer into the question.

## Authority

**Agent-owned** — take it, record it in one line, do not ask:

naming, internal structure, private methods, which existing utility to call, test structure,
file placement inside an established convention, straightforward reuse of a confirmed project
pattern, formatting, log message wording.

**User-confirmed** — present options, recommend, wait:

a new technology or dependency; a new infrastructure component; the persistence strategy; a
change to a published API contract; anything breaking; business behaviour, including defaults
and limits nobody stated; security, authentication, authorisation, retention and personal-data
handling; a messaging or delivery-guarantee choice; a consistency model; adopting or departing
from an organisational standard; anything that spends money.

The boundary in one line: **the agent owns how, the user owns what and whether.**

## Decision rules

```text
IF the decision is user-confirmed and the user has not confirmed it
THEN it is a blocking question. Not a default, not a placeholder, not "for now".

IF a technology appears in the repository and is relevant to the feature
THEN report it as PROJECT_EXISTING and ask whether it applies here.

IF someone asserts an organisational standard
THEN record who asserted it. An unattributed standard is an assumption.

IF a decision is agent-owned but hard to reverse
THEN it is not agent-owned. Reversibility is part of the authority test.

IF a decision is taken under time pressure or with a known unknown
THEN record the unknown alongside it, so the decision is re-openable when it closes.

IF implementation reveals the decision was wrong
THEN supersede it, say what the implementation showed, and update the plan —
     never overwrite the original entry.

IF the same decision is being taken for the third time
THEN it was never recorded. Record it now, where the next person will find it.
```

## What earns a record of its own

Yes: technology, architecture, API contract, persistence, schema, messaging, concurrency model,
consistency, caching, retry and resilience posture, security, observability approach,
compatibility, migration, deployment strategy.

No: local naming, method extraction, test file layout, dependency versions taken from the
project's existing range, anything a reader would learn faster from the code than from a record.

The test is not importance. It is **whether the next person would otherwise have to re-derive
it, and get it wrong**.

## Output

The log, in the dossier, appended to as the feature proceeds:

```text
D-04  Dispatch events are published to the existing Kafka cluster
      Category:    messaging
      Provenance:  USER_MANDATED  (round 2: "reuse the cluster we already run")
      Authority:   user-confirmed — confirmed 2026-09-03
      Options:     see analysis.md, choice "how the dispatch is delivered"
      Record:      decisions/ADR-002-dispatch-transport.md
      Depends on:  U-03 (resolved), C-01 (no new infrastructure)

D-05  Retry is bounded at three attempts with exponential backoff
      Category:    resilience
      Provenance:  AGENT_PROPOSED
      Authority:   agent-owned — reversible, contained in DispatchRetryPolicy
      Because:     no retry policy exists in the project (context report); three
                   attempts bounds the tail at the stated 30s budget
      Record:      none — contained, reversible, visible in one class
```

Every entry carries provenance and authority. An entry missing either is not finished.
