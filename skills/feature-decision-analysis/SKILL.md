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
3. **Assign accountable authority** from the consequence: Product, Engineering, Architecture,
   Security, Data, Operations, Compliance, Finance, or another named role. Participation is not
   approval.
4. **If the accountable role has not confirmed it**, it is a blocking question or a valid `GAP-*`,
   not a decision silently assigned to the current participant.
5. **If it is agent-owned**, take it, state it and move on. Agent ownership is limited to local,
   reversible choices inside accepted constraints. Escalating every low-impact decision is
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

**Agent-owned** choices are local, reversible, observable in review, and inside confirmed constraints:
naming, private structure, file placement within an established convention, or straightforward reuse.

Everything else names the role authorised for its consequence. Product owns behavior and value;
Engineering/Architecture own solution and system boundaries; Security/Privacy/Compliance own their
obligations; Data owns shared semantics/retention where established; Operations owns support/SLO
commitments; Finance owns material spend. One person may hold several roles, but the record names the
role rather than relying on “the user”.

## Decision rules

```text
IF the accountable role has not confirmed a consequential decision
THEN it is blocking or a valid GAP-* accepted by that role. It is not a default or placeholder.

IF a technology appears in the repository and is relevant to the feature
THEN report it as PROJECT_EXISTING. Ask only when reuse changes externally visible behaviour,
     ownership, cost, policy, or reversibility; otherwise follow the established project convention.

IF someone asserts an organisational standard
THEN record who asserted it. An unattributed standard is an assumption.

IF a decision is agent-owned but hard to reverse
THEN it is not agent-owned. Reversibility is part of the authority test.

IF a decision is taken under time pressure or with a known unknown
THEN record the unknown alongside it, so the decision is re-openable when it closes.

IF implementation reveals the decision was wrong
THEN supersede it, say what the implementation showed, and update the plan —
     never overwrite the original entry.

IF a Product Definition or contract revision changes the premise of a decision
THEN mark the ED-* stale and revisit its traced downstream items before continuing.

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
ED-04 Dispatch events are published to the existing Kafka cluster
      Category:    messaging
      Provenance:  USER_MANDATED  (round 2: "reuse the cluster we already run")
      Owner:       Architecture — accepted 2026-09-03
      Consulted:   Product, Operations
      Options:     see analysis.md, choice "how the dispatch is delivered"
      Record:      decisions/ADR-002-dispatch-transport.md
      Depends on:  U-03 (resolved), C-01 (no new infrastructure)

ED-05 Retry is bounded at three attempts with exponential backoff
      Category:    resilience
      Provenance:  AGENT_PROPOSED
      Owner:       agent-owned — reversible, contained in DispatchRetryPolicy
      Because:     no retry policy exists in the project (context report); three
                   attempts bounds the tail at the stated 30s budget
      Record:      none — contained, reversible, visible in one class
```

Every entry carries provenance and authority. An entry missing either is not finished.
