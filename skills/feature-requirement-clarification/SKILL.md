---
name: feature-requirement-clarification
description: >
  Deciding what to ask the user about a feature, when to ask it, and what stops work until it is
  answered: proving the repository cannot answer it first, pricing each question by what changes
  if the answer is the other one, batching questions into rounds instead of interrogating, and
  marking the few that are genuinely blocking. Use when a feature request is ambiguous and the
  choice is between asking and assuming, when a long list of questions is about to be sent at
  once, when work is stalled on a question that has no consequence, when implementation is about
  to start on a guessed answer, or when a question is being asked that a grep would have
  answered. Does not investigate the repository itself (feature-context-analysis), does not
  classify what is known from what is guessed (feature-discovery), and does not own the
  ambiguity catalogue or acceptance-criteria format (requirements-and-acceptance).
---

# Feature Requirement Clarification

## Purpose

Two opposite failures, and both are expensive.

An agent that never asks builds a correct implementation of a requirement nobody agreed, and
the gap surfaces when it is costly to close. An agent that asks everything turns a feature
request into a questionnaire, gets vague answers because the user has stopped reading by
question nine, and still ends up guessing.

The discriminator is not politeness or thoroughness. It is **consequence**: a question earns a
user's attention only when the two answers lead to different work, and only when nothing else
can answer it.

## Workflow

1. **Start from the unknowns**, not from a checklist. Every question traces to a ledger entry;
   a question with no entry behind it is a question you invented.
2. **Use the context report first.** For each unknown, identify repository evidence that would settle
   it and run a focused check only when the report did not already do so. Only what survives becomes a
   question.
3. **Price each surviving question** by impact, and mark BLOCKING or NON-BLOCKING
   (`references/impact-and-blocking.md`). Most questions are neither high-impact nor blocking.
4. **Group dynamically into rounds** (`references/question-rounds.md`). Ask one question when its
   answer controls what is worth asking next; ask two or three only when they share one decision area.
   There is no target number of rounds.
5. **Write each question so it can be answered in one line**, and state the consequence of each
   answer. A question whose consequence you cannot state is not ready to ask.
6. **Proceed on the non-blocking ones** under a stated assumption, recorded as an assumption
   rather than absorbed as a fact.

## The repository-first rule

```text
Can the repository answer this?
        |
   +----+----+
  YES        NO
   |          |
Investigate,  Does the answer change the work?
cite the      |
evidence,  +--+--+
close it  NO     YES
           |      |
       Record   Is it about business intent, an organisational
       as LOW,  standard, or authority the code cannot hold?
       proceed   |
                 +-- YES -> ask; BLOCKING if HIGH impact
                 +-- NO  -> propose, recommend, proceed on the record
```

The repository answers questions about **what is**. It never answers questions about **what
must be** — an implementation found in the code is evidence of a practice, not authority for a
requirement.

## Question classes

| Class            | Who can answer                                        | Typical impact |
| ---------------- | ----------------------------------------------------- | -------------- |
| Functional       | Product or domain owner                               | HIGH           |
| Business rule    | Product, policy or domain owner                       | HIGH           |
| Compatibility    | Repository, then accountable contract/product owner   | HIGH           |
| Data and storage | Repository for shape, accountable data/policy owner   | HIGH           |
| API contract     | Repository for style, contract owner for change       | HIGH           |
| Security         | Accountable security/privacy role — never inferred    | HIGH           |
| Operational      | Repository, then accountable Operations role          | MEDIUM         |
| Performance      | Product/SLO owner for target; repository for baseline | MEDIUM         |
| Technical        | Repository                                            | LOW to MEDIUM  |
| Convention       | Repository                                            | LOW            |

Security, compliance and business-rule questions never resolve to "the repository says so".
The code shows what was built, which may be the defect.

## Decision rules

```text
IF an unknown's two answers produce the same implementation
THEN do not ask it. Record the answer you will proceed on.

IF the answer is discoverable by reading the repository
THEN read it, cite path:line, and close the unknown as a FACT — asking wastes the
     one resource the user actually spends, which is attention.

IF the question is about intent, policy, authority or a standard
THEN it is not discoverable, however much code exists. Ask.

IF a question is BLOCKING
THEN stop dependent work. Offer the focused next round or pause; do not start
     dependent implementation or bury it in a list of twelve.

IF three or more questions can be answered together without ordering between them
THEN batch them into one round rather than sending them one at a time.

IF a question has been asked and the answer was ambiguous
THEN restate it as a choice between two named options, not as an open question.

IF the participant can explain a decision but cannot approve its consequence
THEN record the context and keep the question open for the accountable role.
```

## Constraints

- **One question, one decision.** A question containing "and" is two questions and gets two
  answers, or one.
- **Never present a preference as a question.** If you have a recommendation, give it, with the
  reason, and ask for confirmation. "Which of these five do you want?" transfers your job.
- **Never ask a question whose answer you will override.** If the project's constraints already
  rule an answer out, say so instead of asking.
- **A silent user is not an answer.** Unanswered blocking questions leave work blocked; they do
  not decay into permission.
- **After every round, recommend the next transition.** `Continue`, `Close the stage`, or `Blocked`,
  with the concrete reason. Ask whether to run the next focused round, close, or pause; do not ask a
  content-free “continue?”.

## Output

For each question:

```text
Q-03  Should a failed run be retried automatically, or surfaced for manual retry?
      Class:       Functional
      Impact:      HIGH
      Status:      BLOCKING
      Why:         Automatic retry requires idempotency in the downstream call and a
                   dead-letter path; manual retry requires an operator-facing endpoint.
      Tried:       No retry policy exists in the codebase (grep over the module found none).
      If A:        SC-05 (retry policy) and SC-06 (dead-letter) enter scope.
      If B:        SC-07 (operations endpoint) enters scope; SC-05 and SC-06 do not.
```

Then a one-line summary: how many questions, how many blocking, and what proceeds meanwhile.
Also report the checkpoint recommendation and the decision area another round would resolve.
