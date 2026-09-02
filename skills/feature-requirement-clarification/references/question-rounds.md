# Question rounds

Rounds exist because answers change which later questions are worth asking. Sending all four
rounds at once produces answers to questions that the first round would have retired.

## Round 1 — Business and functional

Asked before any design thinking. Establishes what must become true.

- What must the feature do, stated as an observable outcome?
- What must it explicitly **not** do?
- Which business rules govern it, and where do they come from?
- What is the success condition — how will anyone know it works?
- Who or what invokes it, and what do they get back?
- What happens on each failure the user cares about?
- What volume, and over what window? (A number, or "unknown" — not "high".)

Skip a question in this round only when the request already answers it in words you can quote.

## Round 2 — Technology and constraints

Asked once the behaviour is fixed, because the behaviour decides which of these matter.

- Which technologies are **mandatory** for this feature?
- Which are **preferred**?
- Which are **prohibited**?
- Are there organisational standards this must follow — architecture, API, data, security,
  logging, deployment?
- Are there existing components that must be reused rather than rebuilt?
- Are there compatibility obligations: existing callers, stored data, published contracts?
- What are the security and data-handling obligations?

Every one of these is prefaced by what the repository already showed, so the user is confirming
or correcting rather than reciting:

> The project runs Kafka for the shipping events and has no other broker. Is this feature
> expected to reuse Kafka, or is the messaging technology open?

The point of that phrasing is that it does not smuggle "the project uses Kafka" into "the
feature must use Kafka".

## Round 3 — Architecture and solution

Asked **only** when two or more genuinely viable approaches survive the constraints. If one
approach survives, there is nothing to ask — state it and proceed.

Present, in this order: the options, what separates them, the recommendation, and what the
recommendation costs. Ask for a decision, not for an opinion.

## Round 4 — Confirmation

One message, before implementation. Not a re-litigation: a restatement of what will be built
and what will not, so a misunderstanding surfaces now rather than in review.

- The scope, in and out.
- The decisions taken and by whom.
- The assumptions still standing, with their falsifiers.
- The acceptance criteria.
- Anything still open, and what it blocks.

Round 4 is skipped for Direct-class work and shortened to the scope line and the assumptions
for Standard-class work.

## Ordering rules

- A round is closed when its blocking questions are answered, not when all of them are.
- Non-blocking questions from an earlier round may travel with a later round.
- A question that only becomes askable because of an earlier answer belongs to the later round;
  do not ask it speculatively in both forms.
- If the user answers a question you have not asked yet, close it and skip it. Do not ask it
  back for confirmation.
