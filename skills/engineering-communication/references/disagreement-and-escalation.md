# Disagreement and escalation

## Separate the checkable claim from the preference

Most technical arguments contain both, tangled together, and only one of them can be settled by
evidence. Untangling them is the whole technique.

| Statement                                    | Kind                              | How it ends                                                                                             |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| "This will deadlock under concurrent update" | Checkable                         | Inspect lock order and construct the claimed interleaving; a passing stress test does not prove absence |
| "This won't scale"                           | Checkable, once quantified        | Ask: at what load, measured how?                                                                        |
| "This is over-engineered"                    | Preference, until it names a cost | Ask which abstraction, and what it costs to keep                                                        |
| "Nobody uses that pattern any more"          | Neither                           | Not an argument. Ask what problem it causes here.                                                       |

Move every argument toward the first row. "What would we observe if you are right, and what
would we observe if I am?" ends more disagreements than any amount of position-holding, because
it converts a contest into a measurement.

When the disagreement genuinely is about preference — layout, naming style, which of two
equivalent structures — follow established conventions and the decision owner's remit;
otherwise defer to the person doing the work
(code-review).

## Ending a two-round argument

Two rounds with no new information means the exchange has stopped producing anything. The next
message should be one of:

- **A test or a measurement.** "I'll write the concurrent case and we'll see."
- **A timebox.** "Let's spend an hour on a spike; if it holds up, we do it your way."
- **A decision by whoever owns it**, stated as such: "This is your area — I've registered my
  concern about the lock scope; going with your call."
- **An escalation**, if the consequence is large and neither of you owns it.

What it should not be: the same argument in different words, or a longer version. Repeating
an unchanged argument indefinitely adds no evidence. Two rounds is a practical
prompt to change approach, not a mandatory threshold for urgent escalation.

## Disagree and commit

Once an authorized decision is made within applicable constraints, implement it properly.
Record a reconsideration trigger; new material evidence or a breached constraint warrants
reopening the decision rather than silent compliance or a deliberately poor implementation.

Record the disagreement where it is useful rather than in the code: a line in the decision
record (architecture-decision-making), naming what you expect to go wrong and what would show
it. That serves two purposes — it is a fair record, and if the predicted problem appears, there
is a documented signal to act on rather than an argument about who said what.

Never encode dissent as a comment in the source: `// this is a bad idea but I was overruled` is
directed at a colleague, permanent, and read by people who have no context.

## Disagreeing with someone more senior

Keep the evidence and consequence clear regardless of seniority. Ask about missing context
when useful; do not weaken a verified claim merely because its recipient is more senior:

> "I might be missing context — with the pool at 5 connections, my measurement shows checkout
> queueing at about 200 rps, and we peak at 400. Is there a reason to keep it low that I'm not
> seeing?"

This is not deference for its own sake. It genuinely might be that they know something you do
not — a constraint from the vendor, a limit in the network — and the question surfaces it in one
round. If there is no such reason, you have made the point without requiring anyone to lose an
argument.

If overruled on something you believe is genuinely dangerous — data loss, security, a legal
obligation — say so once, explicitly and in writing, with the specific consequence:

> "To be clear about my position: with this configuration, a partial failure leaves orders
> charged but not recorded, and we have no recovery path demonstrated. I recommend delaying
> this change until the owner decides on a reconciliation path or an acceptable alternative."

Identify who can accept the risk and which constraints cannot be waived by that decision.
Follow the applicable incident or review procedure; a recorded objection alone does not
make an unsafe or unauthorized action acceptable.

## Escalating

Escalate when the decision is above the level where it is currently stuck, not when you are
losing.

Legitimate triggers:

- The decision requires authority nobody in the conversation has (budget, legal, cross-team
  priority).
- Two teams have conflicting commitments and neither can unilaterally yield.
- A risk you have raised has been acknowledged and not decided, and the window to act is
  closing.
- Something is unsafe — data loss, a security exposure, a legal obligation.

**Normally tell the person and prefer escalating together.** Use the designated urgent or
confidential reporting channel when prior notification would delay containment, expose
sensitive information or undermine that channel. Notification is not a prerequisite to
raising an urgent risk. Share only the details the recipients need.

What the escalation message contains:

1. The decision needed, stated as a question with options — not "please advise".
2. What each option costs, in their terms.
3. The positions held, fairly represented, including the one you disagree with.
4. Your recommendation and its reason.
5. The date by which the decision stops being useful.

Represent the other position fairly; if it is unknown, say so. Missing context need not
delay an urgent escalation.

## For an agent

- Do not escalate to the user for a decision you can make from the code and the conventions in
  front of you. Ask when the readings diverge materially, and batch the questions
  (requirements-and-acceptance).
- When you disagree with an authorized instruction, state the specific consequence and
  continue within the applicable constraints. Do not reopen an unchanged preference dispute;
  do surface new material evidence or an action outside the granted authority.
- Represent uncertainty at the level you actually have it. "I could not run the integration
  tests — no container runtime available — so the mapping is unverified" is worth more than a
  summary that omits it (coding-agent-discipline).
