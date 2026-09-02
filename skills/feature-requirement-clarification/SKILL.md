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
2. **Try the repository first.** For each unknown, name the command or file that would settle
   it and run it. Only what survives that becomes a question. See the routing rule below.
3. **Price each surviving question** by impact, and mark BLOCKING or NON-BLOCKING
   (`references/impact-and-blocking.md`). Most questions are neither high-impact nor blocking.
4. **Group into rounds** (`references/question-rounds.md`). Business before technology,
   technology before architecture, architecture before confirmation. Do not open a later round
   while an earlier one has unanswered blocking questions.
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

| Class            | Who can answer                                         | Typical impact |
| ---------------- | ------------------------------------------------------ | -------------- |
| Functional       | User                                                   | HIGH           |
| Business rule    | User                                                   | HIGH           |
| Compatibility    | Repository, then user for the policy                   | HIGH           |
| Data and storage | Repository for shape, user for policy                  | HIGH           |
| API contract     | Repository for style, user for change                  | HIGH           |
| Security         | User — never inferred                                  | HIGH           |
| Operational      | Repository, then user                                  | MEDIUM         |
| Performance      | User for the target, repository for the current number | MEDIUM         |
| Technical        | Repository                                             | LOW to MEDIUM  |
| Convention       | Repository                                             | LOW            |

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
THEN stop. Do not open the next round, do not start implementation, and do not
     bury it in a list of twelve.

IF three or more questions can be answered together without ordering between them
THEN batch them into one round rather than sending them one at a time.

IF a question has been asked and the answer was ambiguous
THEN restate it as a choice between two named options, not as an open question.
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
      If A:        R05 (retry policy) and R06 (dead-letter) enter scope.
      If B:        R07 (operations endpoint) enters scope; R05 and R06 do not.
```

Then a one-line summary: how many questions, how many blocking, and what proceeds meanwhile.
