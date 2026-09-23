---
name: feature-requirement-clarification
description: >
  Deciding what to ask the user about a feature, when to ask it, and what stops work until it is
  answered: reusing supplied answers and checking relevant evidence first, pricing each question by what changes
  if the answer is the other one, batching questions into rounds instead of interrogating, and
  marking the few that are genuinely blocking. Use when a feature request is ambiguous and the
  choice is between asking and assuming, when a long list of questions is about to be sent at
  once, when work is stalled on a question that has no consequence, when implementation is about
  to start on a guessed answer, or when a question is being asked that a grep would have
  answered. Does not own the repository context report (feature-context-analysis), does not
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
available can settle the missing intent, evidence or authority. A focused search can establish a
bounded gap; it need not prove that no answer exists anywhere.

## Workflow

1. **Start from the unknowns**, not from a checklist. Trace each question to an existing unknown
   or record the newly discovered gap; a small Inline task needs only a concise entry.
2. **Reuse supplied answers and the context report.** Check accepted session decisions and applicable
   policy/contract evidence before asking again. Run a focused repository check only when it could
   settle the remaining gap; a scope question needed to locate relevant code can come first.
3. **Price each surviving question** by impact, and mark BLOCKING or NON-BLOCKING
   (`references/impact-and-blocking.md`). Assess consequences and the work about to start;
   high impact alone does not establish a blocker.
4. **Group dynamically into rounds** (`references/question-rounds.md`). Ask one question when its
   answer controls what is worth asking next; ask two or three only when they share one decision area.
   There is no target number of rounds.
5. **Write each question so it can be answered in one line**, and state the consequence of each
   answer. A question whose consequence you cannot state is not ready to ask.
6. **Proceed with independent authorized work.** Keep later consequential questions unresolved until
   their answers are needed. Adopt a stated, bounded assumption only for a reversible choice within
   existing authority; non-blocking for current work does not mean the missing answer was decided.
7. **Update question state when an answer arrives or changes.** Record its source and applicable
   scope; close only what it resolves. When an accepted answer changes, reassess affected questions
   and dependent work using `references/question-rounds.md`; preserve unaffected answers.

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
                 +-- YES -> reuse valid authority, otherwise ask;
                 |          block only work depending on the answer
                 +-- NO  -> proceed within existing authority if reversible;
                            otherwise resolve the missing decision
```

Implementation evidence answers **what is**, not automatically **what must be**. An accepted,
applicable policy, contract or decision stored in the repository can establish requirements;
cite its authority, revision and scope. Resolve conflicts rather than choosing the most common code.

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

Security, compliance and business rules need applicable authority, which may already be supplied.
Code alone shows what was built, which may be the defect. Typical impact is a prompt to inspect
consequences, not a fixed score by category.

## Decision rules

```text
IF plausible answers change no behavior, acceptance, obligation, scope or relevant work
THEN do not ask now. Record irrelevance or a bounded assumption, not an invented answer as fact.

IF the answer is discoverable by reading the repository
THEN read it, cite path:line and revision/scope, and close only the proposition established
     by that evidence. A failed search or unavailable source leaves a bounded unknown.

IF the question is about intent, policy, authority or a standard
THEN reuse applicable accepted evidence; ask only for the unresolved decision or conflict.

IF a question is BLOCKING
THEN stop dependent work. Offer the focused next round or pause; do not start
     dependent implementation or bury it in a list of twelve.

IF two or three questions share a decision area and none depends on another's answer
THEN batch them; do not turn all remaining unknowns into one questionnaire.

IF a question has been asked and the answer was ambiguous
THEN name the unresolved distinction and offer concrete options where useful, allowing correction
     or another answer instead of forcing a false binary.

IF the participant can explain a decision but cannot approve its consequence
THEN record the context and keep the question open for the accountable role.
```

## Constraints

- **One question, one decision.** Split independent decisions; related context may belong together.
- **Never present a preference as a question.** If you have a recommendation, give it, with the
  reason. Ask for confirmation only when the choice needs missing authority or intent;
  routine authorized decisions do not need a preference poll.
- **Never ask a question whose answer you will override.** If the project's constraints already
  rule an answer out, say so instead of asking.
- **A silent user is not an answer.** Unanswered blocking questions leave work blocked; they do
  not decay into permission.
- **After every round, recommend the next transition.** `Continue`, `Close the stage`, or `Blocked`,
  with the concrete reason and affected scope. Continue within existing authorization; ask only
  for missing input or a genuinely undecided transition, not permission to ask another question.

## Output

For each question:

```text
Q-03  Should a failed run be retried automatically, or surfaced for manual retry?
      Class:       Functional
      Impact:      HIGH
      Status:      BLOCKING
      Why:         The next resource must define retry safety and failure recovery.
      Tried:       <paths/revision/search> found no applicable policy in that scope;
                   supplied decisions did not settle it. This is not proof of global absence.
      If A:        Define retry bounds and duplicate-effect handling for retriable operations.
      If B:        Define an authorized manual recovery path, reusing existing operations tooling.
      Affected:    <dependent resources>; independent <resources> can proceed.
```

These are candidate consequences, not permission to add a dead-letter queue or new endpoint.
Scale the record to the question; do not require the full block for a simple clarification.

Then a one-line summary: how many questions, how many blocking, and what proceeds meanwhile.
Also report the checkpoint recommendation and the decision area another round would resolve.
