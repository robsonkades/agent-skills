# Estimates, targets and commitments

## Three different things

| Thing          | Whose statement | Means                                                | Changes when            |
| -------------- | --------------- | ---------------------------------------------------- | ----------------------- |
| **Estimate**   | Engineering     | What we predict, with uncertainty                    | New evidence arrives    |
| **Target**     | Business        | What the business wants or needs                     | Business priority moves |
| **Commitment** | Both, agreed    | What we have promised, having compared the other two | Renegotiated explicitly |

They are routinely collapsed into one number, and the collapse is what makes schedules dishonest.
A target announced as an estimate cannot be argued with on technical grounds; a commitment
derived from an estimate without anyone deciding to make it means nobody knows what was promised.

Keep the words distinct in writing, even when it feels pedantic:

> "The estimate is 18–25 days at 80%. The target is the 12th, which is 14 working days. Those
> do not meet; here are three ways to close the gap."

That sentence is answerable. "It'll be about two weeks" is not.

## When a target is handed to you as an estimate

> "This should take about three days, right?"

Do not answer the question as asked, and do not simply refuse it. Give your estimate, name the
difference, and make the gap a decision:

> "My estimate is 6–9 days at 80% confidence. The parts driving it are the migration and the
> backfill on the existing 4 million rows. Three days is achievable if we ship the read path
> first and backfill the following week — is that acceptable, or does it need to be one
> release?"

Three things happened: the estimate was stated, the reason was specific enough to be
contradicted, and an option was offered. The alternative — agreeing to three days — moves the
same conversation to day four, when it is more expensive and you have less credit.

## Negotiating the four variables

A schedule has scope, time, people and quality. Three of them are negotiable.

- **Scope** — the first and best lever. Ship the 80% that delivers the value, cut or defer the
  rest. Requires knowing which is which (requirements-and-acceptance).
- **Time** — moving the date, when the date is not externally fixed.
- **People** — usually the weakest lever, and on a late project it is often negative: the
  ramp-up cost is paid by exactly the people who were producing.
- **Quality** — not negotiable in the sense people mean it. You can defer specific,
  named, scoped work with a plan to pay it back (technical-debt-decisions); you cannot "test
  less" as a schedule strategy without the cost arriving during the release, with interest.

When asked to commit to something you believe is not achievable, the answer names the lever:
"not at this scope; here is what fits" is a yes to something.

## Communicating a slip

Report it as soon as you believe it, not when it is undeniable. The value of the information is
proportional to the time left to act on it, and reaches zero on the due date.

Structure (engineering-communication has the general form):

1. **Fact.** "The migration will not be ready for the 12th."
2. **Why, specifically.** "The backfill takes 6 hours against production volume; it was 20
   minutes against the test dataset."
3. **New estimate, with confidence.** "The 19th, 80% — the remaining uncertainty is whether we
   can run it online."
4. **Options.** "Ship the read path on the 12th and backfill the week after; or hold the whole
   feature to the 19th; or run the backfill in a maintenance window on the 14th."
5. **Recommendation, with the reason.** "I would ship the read path first: it delivers the
   reporting the finance team asked for, and it de-risks the backfill by letting us verify the
   new column against live traffic."

What to leave out: apology beyond a clause, blame, and the narrative of the week. What to
include without being asked: whether this slip changes any other estimate you have given.

## Repeated slips

One slip is information. A pattern is a calibration problem, and it needs to be treated as one
rather than as a series of individual apologies:

- Compare estimated against actual for the last ten pieces of work. The ratio is usually
  strikingly consistent, and applying it is a legitimate correction, not cheating.
- Check what is systematically omitted — almost always review latency, rework after
  demonstration, and environment problems.
- Check whether estimates are being negotiated downward before being recorded. If so, the
  estimates are not the problem.

## For an agent producing an estimate

- Say plainly when you cannot estimate elapsed time. An agent has no access to the team's
  interruption rate, review latency, deployment cadence or holiday schedule — the factors that
  dominate calendar time. Estimating _work_ ("about 200 lines across four files, one migration")
  is honest; estimating _days_ from that is a guess presented as analysis.
- Prefer decomposition to a number: listing the pieces, their risks and what is unknown gives
  the human everything needed to apply their own calibration.
- Flag the parts you cannot see: unfamiliar internal systems, undocumented behaviour, data you
  cannot inspect. Those are where the estimate will be wrong, and naming them is more useful
  than absorbing them into a larger number.
- Never restate a target back as an estimate because it was in the prompt. If the request says
  "this should be quick", that is an anchor, not evidence (coding-agent-discipline).
