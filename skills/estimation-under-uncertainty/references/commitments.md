# Estimates, targets and commitments

Numbers below are illustrative scenario inputs, not defaults to copy into a real estimate.
Use supplied evidence and explicit units/calendar assumptions. A target is not authorization
to make a commitment for another person or team.

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

> "The model's central P10–P90 range is 18–25 working days from the agreed start; its
> historical calibration is still unverified. The target is 14 working days from that same
> start. It is earlier than P10 in this model; here are options to assess."

That sentence is answerable. "It'll be about two weeks" is not.

## When a target is handed to you as an estimate

> "This should take about three days, right?"

Do not answer the question as asked, and do not simply refuse it. Give your estimate, name the
difference, and make the gap a decision:

> "My provisional scenario range is 6–9 working days, not a calibrated probability. The
> main unknowns are the migration and backfill on 4 million rows. A read-only first release
> might reduce scope, provided it works correctly before backfill. We need to verify and
> estimate that slice before promising three days. Does a staged release meet the requirement?"

Three things happened: the estimate was stated, the reason was specific enough to be
contradicted, and an option was offered. The alternative — agreeing to three days — moves the
same conversation to day four, when it is more expensive and you have less credit.

## Negotiating the four variables

A schedule has scope, time, people and quality. Three of them are negotiable.

- **Scope** — identify a smaller independently useful slice and verify its dependencies;
  there is no universal 80% slice (requirements-and-acceptance).
- **Time** — moving the date, when the date is not externally fixed.
- **People** — assess parallelizable work, expertise, onboarding and coordination. Added
  capacity can help, but does not divide elapsed time by headcount.
- **Quality** — not negotiable in the sense people mean it. You can defer specific,
  named, scoped work with a plan to pay it back (technical-debt-decisions); you cannot "test
  less" as a schedule strategy without the cost arriving during the release, with interest.

When asked to commit to something you believe is not achievable, the answer names the lever:
"not at this scope; here is what fits" is a yes to something.

## Communicating a slip

Report material slip risk promptly and distinguish risk from a confirmed missed target.
Earlier updates leave more options; a missed date still needs a revised plan and impact update.

Structure (engineering-communication has the general form):

1. **Fact.** "The migration will not be ready for the 12th."
2. **Why, specifically.** "The backfill takes 6 hours against production volume; it was 20
   minutes against the test dataset."
3. **Revised forecast and basis.** "The 19th is a provisional forecast scenario pending the online
   backfill rehearsal; we do not yet have a calibrated completion probability."
4. **Options.** "Ship the read path on the 12th and backfill the week after; or hold the whole
   feature to the 19th; or run the backfill in a maintenance window on the 14th."
5. **Recommendation, with conditions.** "Assess the read path first if it can deliver useful,
   correct results before backfill; otherwise hold the feature. Update the forecast after
   the rehearsal, and name the owner and update time from the actual plan."

What to leave out: apology beyond a clause, blame, and the narrative of the week. What to
include without being asked: whether this slip changes any other estimate you have given.

## Repeated slips

Repeated slips warrant investigating calibration, scope churn, dependencies and capacity:

- Compare recorded forecasts and actuals for comparable work, reporting sample size and
  changing conditions. A ratio correction is a hypothesis to validate on later outcomes,
  not an automatically stable multiplier.
- Check omissions such as review latency, demonstration rework and environment problems.
- Check whether estimates are being negotiated downward before being recorded. If so, the
  estimates are not the problem.

## For an agent producing an estimate

- Inspect any supplied or accessible team history, capacity, review/deployment cadence and
  calendars. If these are missing, say elapsed time is conditional or unavailable. File/line
  counts do not establish effort; describe concrete work and uncertainty without inventing counts.
- Prefer decomposition to a number: listing the pieces, their risks and what is unknown gives
  useful inputs for calibration. Provide a justified forecast when the required evidence is
  available; do not refuse every elapsed-time estimate merely because an agent is producing it.
- Flag the parts you cannot see: unfamiliar internal systems, undocumented behaviour, data you
  cannot inspect. Those are where the estimate will be wrong, and naming them is more useful
  than absorbing them into a larger number.
- Never restate a target back as an estimate because it was in the prompt. If the request says
  "this should be quick", that is an anchor, not evidence (coding-agent-discipline).
