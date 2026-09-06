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

This skill makes **provenance** and **authority** explicit. Missing evidence is recorded as
unresolved; it prevents claiming acceptance, not documenting the proposal or continuing
independent work.

## Workflow

1. **Notice consequential choices**, including defaults that affect the feature's contracts
   or constraints. Do not inventory every naming alternative; the categories are below.
2. **Assign provenance** from the four classes. This is a question of fact and it is checkable
   (`references/provenance-and-authority.md`).
3. **Assign accountable authority** from the consequence: Product, Engineering, Architecture,
   Security, Data, Operations, Compliance, Finance, or another named role. Participation is not
   approval.
4. **Check existing authorization first.** User instructions, accepted decisions and delegated
   authority can already cover the choice. Reuse that evidence without asking again. If a
   material choice lies outside it, record a proposal and the specific unresolved authority;
   prepare a concrete option and continue independent work before asking a focused question.
5. **If it is agent-owned**, take it, state it and move on. Agent ownership is limited to local,
   reversible choices inside accepted constraints, plus choices explicitly delegated by the
   user or applicable policy. Escalating every low-impact decision is
   its own failure: it trains the user to stop reading.
6. **Record it when it is taken**, in the log below. A decision that materially affects
   architecture, behaviour, data, operations, security, performance or reliability also earns a
   record of its own.
7. **When a later discovery contradicts it**, supersede rather than edit. The history is the
   part that has value.

## Provenance — the four classes

| Class                  | Means                                             | Established by                                                                |
| ---------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| **USER_MANDATED**      | The user required it                              | Their message, quoted                                                         |
| **CORPORATE_MANDATED** | An applicable organisational standard requires it | Attributed confirmation or authoritative policy with issuer, scope and status |
| **PROJECT_EXISTING**   | The project already does it this way              | `path:line`, with a count                                                     |
| **AGENT_PROPOSED**     | The agent chose it                                | The analysis behind it                                                        |

**The rule the whole skill exists for: PROJECT_EXISTING never promotes itself.** Finding Kafka
in the build file establishes a declared dependency; runtime use needs wiring/consumer evidence.
Neither establishes that this
feature must, that the organisation requires it, or that the user wants it. The promotion from
"observed" to "required" needs an applicable instruction or policy, not repetition in code.

When reuse is inside the agreed scope, state the evidence and proceed:

> The project runs Kafka for shipping events (`pom.xml:104`, two consumers under
> `src/main/java/.../shipping`). The accepted scope permits reuse; I will apply that convention
> and record topic ownership and retention checks. If these reveal a new commitment outside
> the authorization, I will surface that specific decision.

When the decision is a technology choice — a library, a store, a broker, a protocol, anything new
to run — read `references/technology-questions.md` for the areas where such a choice hides and
for how to ask about one without smuggling the answer into the question.

## Authority

**Agent-owned** choices are local, reversible, observable in review, and inside confirmed constraints:
naming, private structure, file placement within an established convention, or straightforward reuse.
Explicit task authorization can delegate broader implementation choices; record its scope rather
than inventing an additional approver or treating role labels as proof of authority.

Everything else names the role authorised for its consequence. Product owns behavior and value;
Engineering/Architecture own solution and system boundaries; Security/Privacy/Compliance own their
obligations; Data owns shared semantics/retention where established; Operations owns support/SLO
commitments; Finance owns material spend. One person may hold several roles, but the record names the
role rather than relying on “the user”.

## Decision rules

```text
IF a consequential decision is outside established authorization
THEN record PROPOSED/PENDING with its missing authority and blocked dependent action;
     use an accepted GAP-* only within its stated scope, never as invented approval.

IF a technology appears in the repository and is relevant to the feature
THEN report it as PROJECT_EXISTING. Ask only when reuse changes externally visible behaviour,
     ownership, cost, policy, or reversibility beyond existing authorization; otherwise proceed
     under the accepted constraints and established convention.

IF someone asserts an organisational standard
THEN record who asserted it. An unattributed standard is an assumption.

IF a decision is hard to reverse
THEN check whether existing authorization covers that consequence; do not infer authority
     from its being a small code change or a configurable number.

IF a decision is taken under time pressure or with a known unknown
THEN record the unknown alongside it, so the decision is re-openable when it closes.

IF implementation reveals the decision was wrong
THEN supersede it, say what the implementation showed, and update the plan —
     never overwrite the original entry.

IF a Product Definition or contract revision changes the premise of a decision
THEN mark the ED-* stale and revisit affected downstream work; continue independent work.

IF the same decision is being taken for the third time
THEN look for an existing record and changed premises before creating a duplicate.
```

## What earns a record of its own

Yes: technology, architecture, API contract, persistence, schema, messaging, concurrency model,
consistency, caching, retry and resilience posture, security, observability approach,
compatibility, migration, deployment strategy.

Usually no: local naming, method extraction, test file layout, anything a reader would learn
faster from code. A version change within an allowed range can still affect runtime/API behavior;
inspect resolved versions, toolchains and compatibility evidence before classifying it as routine.

The test is not importance. It is **whether the next person would otherwise have to re-derive
it, and get it wrong**.

## Output

The log, in the dossier, appended to as the feature proceeds:

```text
ED-04 Dispatch events are published to the existing Kafka cluster
      Category:    messaging
      Provenance:  USER_MANDATED  (round 2: "reuse the cluster we already run")
      Owner:       Architecture — accepted 2026-09-03
      Status:      ACCEPTED; authority/acceptance linked in ADR-002
      Consulted:   Product, Operations
      Options:     see analysis.md, choice "how the dispatch is delivered"
      Record:      decisions/ADR-002-dispatch-transport.md
      Depends on:  U-03 (resolved), C-01 (no new infrastructure)

ED-05 Dispatch retry policy within the accepted 30s request deadline
      Category:    resilience
      Provenance:  AGENT_PROPOSED
      Owner:       Engineering — delegated implementation within ED-03 deadline/load constraints
      Status:      PROPOSED; validate before calling it accepted
      Because:     at most three attempts including the initial call; per-attempt timeout
                   and backoff/jitter must fit the remaining deadline, with retryable
                   failures and duplicate-effect protection established by CT-02
      Verification: timeout/lost-response cases; request budget and downstream load
      Record:      decisions/ADR-003-dispatch-retries.md
```

Every entry carries provenance, authority evidence and status. An unresolved source remains
unknown in a pending record; never invent a mandate or relabel someone else's choice as yours.
