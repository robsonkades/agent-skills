# Message patterns

Each pattern below is shown in a version that fails and a version that works. The difference is
rarely length — usually it is order, and whether a decision was left for the reader to make or
left for them to discover.

## Raising a risk before it materialises

**Fails:**

> Just so you know, I have some concerns about the export feature and the amount of data
> involved. It might be worth thinking about at some point.

No trigger, no impact, no decision, no date. It has been said, which means it can be held
against you later, and it cannot be acted on, which means it will not be.

**Works:**

> **Risk: the CSV export will time out for our largest customers.**
>
> Measured: the export runs in-request and takes 40 s for 50,000 orders. Our top 30 customers
> are above that; the largest is at 400,000 orders, which extrapolates to roughly 5 minutes
> against a gateway timeout of 60 s.
>
> **Impact:** those customers get a 504 and no file. They are also the ones most likely to use
> the feature.
>
> **Options:** (a) cap the export at 12 months and ship Thursday; (b) make it asynchronous with
> an email link — about 4 extra days; (c) ship as is and handle the complaints manually.
>
> **Recommendation:** (a) now, (b) next sprint. The cap covers the stated use case — reconciling
> the current financial year — and we learn who actually needs more before building the job.

Trigger, measurement, extrapolation shown as extrapolation, impact in the reader's terms,
options with costs, a recommendation with a reason. It can be answered in one line.

## Reporting a slip

**Fails:**

> Sorry, this is taking longer than I thought. There were some unexpected complications with the
> migration and the test environment was down for most of Tuesday. I should have it soon.

Apology first, narrative second, no new date, "soon" is not a date. The reader must now ask a
follow-up question, and their plan is still wrong in the meantime.

**Works:**

> **The migration will not be ready for the 12th. New estimate: the 19th, 80% confident.**
>
> The backfill takes 6 hours against production volume — it was 20 minutes against the test
> dataset, which is 200× smaller. That was my error in extrapolating.
>
> **Options:** ship the read path on the 12th and backfill the following week; hold the whole
> feature to the 19th; or run the backfill in a maintenance window on the 14th.
>
> **Recommendation:** ship the read path on the 12th. Finance gets the report they asked for on
> time, and running the backfill against live traffic afterwards lets us verify the new column
> before anything depends on it.
>
> This does not affect the invoicing work; that is still on track for the 20th.

One clause of ownership, no self-flagellation. The last line is the one people forget and the
one the reader most wants: what else is affected.

## Saying no

**Fails, by refusing:**

> We can't do that.

**Fails, by agreeing:**

> Okay, we'll try to get it in.

The first ends the conversation with the requester's problem unsolved. The second is a
commitment nobody has checked, and it will be discovered as false at the worst moment.

**Works:**

> Not at this scope by the 30th — the parts driving that are the audit trail and the per-tenant
> permissions, which are about 8 days between them.
>
> What fits by the 30th: the export itself with a global permission check, audit deferred. That
> covers the compliance requirement for the pilot tenants and leaves the audit trail for the
> following release.
>
> If the audit trail must ship with it, the date moves to about the 12th. Which matters more?

The refusal is specific and costed, an alternative is on the table, and the trade is handed
back as a question the requester is entitled to answer.

## Incident status update

Send on a fixed cadence, and say when the next one comes even if nothing has changed. Silence
during an incident is read as "it is worse than they are saying" and generates interruptions
that slow the response.

> **14:20 — Checkout failing for ~15% of requests. Investigating. Next update 14:40.**
>
> **Known:** errors began 13:58, coincide with deploy 4471. Payments gateway is responding
> normally; the errors are our own timeouts.
>
> **Unknown:** whether the deploy is the cause. Rollback is prepared and takes about 4 minutes.
>
> **Now:** comparing the deploy diff and a thread dump from one affected node, in parallel.

Known / unknown / doing now / next update. Do not speculate about cause in a status update — it
gets repeated as fact and is remembered long after it is disproved.

Say "rolled back" or "mitigated" plainly when it happens, and do not declare resolution until
the metric is back to normal for long enough to mean it.

## Post-incident summary

For the people who were not in the room. The cause, the trigger, what was affected, what has
been fixed, what remains — and no names.

> **Checkout errors, 13:58–14:31, ~15% of requests failed.**
>
> **Cause:** deploy 4471 reduced the HTTP client's connection pool from 50 to 5 per route,
> through a configuration default that changed in the library upgrade included in that deploy.
> Under normal traffic, checkout requests queued for connections and timed out.
>
> **Trigger:** normal afternoon traffic. Nothing unusual happened; the change was sufficient on
> its own, which is why it was not caught in staging where traffic is 3% of production.
>
> **Fixed:** pool size set explicitly and asserted in a configuration test. Deployed 15:10.
>
> **Remaining:** the client's connection-pool saturation is not on a dashboard — we found this
> from a thread dump. Adding the metric, and an alert on pool wait time (ticket PLAT-882).

The "remaining" section is the part that prevents the next occurrence, and it is the part most
often omitted because the incident feels over.

## What to leave out of all of these

- The chronology of your investigation. Interesting to you, noise to the reader.
- Apology beyond a clause. Repeated apology asks the reader to reassure you, which is work.
- Hedging that removes the claim: "it may possibly be the case that there could be an issue".
- Names attached to mistakes. The system allowed it; that is the finding.
- Certainty about a cause you have not confirmed.
