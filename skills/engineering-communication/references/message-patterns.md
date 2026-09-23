# Message patterns

Each pattern below is shown in a version that fails and a version that works. The difference is
rarely length — usually it is order, and whether a decision was left for the reader to make or
left for them to discover. All numbers, dates and roles below are illustrative scenario
inputs, not benchmarks or reusable commitments. Replace them only with supplied evidence;
leave missing facts explicit. Times within each incident example use UTC on the same day.

## Raising a risk before it materialises

**Fails:**

> Just so you know, I have some concerns about the export feature and the amount of data
> involved. It might be worth thinking about at some point.

No trigger, no impact, no decision, no date. It has been said, which means it can be held
against you later, and it cannot be acted on, which means it will not be.

**Works:**

> **Risk: the CSV export may exceed the gateway deadline for our largest customers.**
>
> Measured: the export runs in-request and takes 40 s for 50,000 orders. Our top 30 customers
> are above that; the largest is at 400,000 orders. A linear extrapolation is 320 s
> against a gateway timeout of 60 s; scaling and production contention remain unmeasured.
>
> **Impact if the deadline is exceeded:** the request returns 504 rather than a file;
> server-side work may continue. The affected customer count needs a volume check.
>
> **Options:** (a) ship Thursday only for volumes validated within the deadline, with an
> explicit row limit; (b) build asynchronous export — engineering estimates about 4 extra
> days, subject to validating storage and access controls; (c) delay the export.
>
> **Recommendation:** validate (a) now; a 12-month filter alone does not bound row count.
> Product must confirm whether the limit meets the reconciliation use case. Export owner:
> Reporting team. Decision needed by Wednesday 12:00 UTC; escalate to the release owner if
> no validated limit is available then.

Trigger, measurement, extrapolation shown as extrapolation, impact in the reader's terms,
options with costs, a recommendation with a reason. It can be answered in one line.

## Reporting a slip

**Fails:**

> Sorry, this is taking longer than I thought. There were some unexpected complications with the
> migration and the test environment was down for most of Tuesday. I should have it soon.

Apology first, narrative second, no new date, "soon" is not a date. The reader must now ask a
follow-up question, and their plan is still wrong in the meantime.

**Works:**

> **The migration will not be ready for the 12th. Revised target: the 19th, conditional on
> the production-volume rehearsal and validation below.**
>
> The initial production-volume rehearsal took 6 hours — the test dataset, 200× smaller,
> took 20 minutes. My earlier estimate did not account for that gap. We still need to repeat
> the rehearsal with representative concurrent traffic.
>
> **Options:** ship the read path on the 12th and backfill the following week; hold the whole
> feature to the 19th; or run the backfill in a maintenance window on the 14th.
>
> **Recommendation:** ship the read path on the 12th only if it works correctly before
> backfill, as verified by the migration tests. Otherwise hold the feature. Migration owner:
> Data team; next estimate update after Thursday's production-volume rehearsal.
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
> A smaller candidate is CSV-only export, deferring scheduled exports and additional formats
> while keeping tenant isolation and the required audit trail. Engineering still needs to
> size this scope before promising the 30th; changing mandatory controls is not a scope shortcut.
>
> Shall we size that smaller scope, or plan a later date for the full feature?

The refusal is specific and costed, an alternative is on the table, and the trade is handed
back as a question the requester is entitled to answer.

## Incident status update

Send on a fixed cadence, and say when the next one comes even if nothing has changed. Silence
during an incident is read as "it is worse than they are saying" and generates interruptions
that slow the response.

> **14:20 UTC — Checkout failed for ~15% of requests during 14:15–14:20, from the checkout
> request dashboard. Investigating. Next update 14:40 UTC; owner: incident communications lead.**
>
> **Known:** errors began 13:58, coincide with deploy 4471. Payments gateway is responding
> normally in the telemetry inspected so far; checkout logs record client-side timeouts.
>
> **Unknown:** whether the deploy is the cause. Rollback is prepared and takes about 4 minutes.
>
> **Now:** comparing the deploy diff and a thread dump from one affected node, in parallel.

Known / unknown / doing now / next update. Include a causal hypothesis only when it helps
the audience act, label it explicitly and state the check underway. Never promote timing
correlation to confirmed cause or promise a recovery ETA from a next-update time.

Say "rolled back" or "mitigated" plainly when it happens, and do not declare resolution until
agreed recovery criteria hold: name the affected metrics, observation window and any
remaining backlog or integrity checks. A mitigation is not necessarily a permanent fix.

## Post-incident summary

For the people who were not in the room. The cause, the trigger, what was affected, what has
been fixed, what remains, and action ownership. Keep the causal account blameless while
retaining accountable owners and necessary audit facts.

> **Checkout errors, 13:58–14:31. During 14:15–14:20, ~15% of checkout requests failed,
> from the request dashboard; the whole-incident failure rate is still uncalculated.**
>
> **Cause:** deploy 4471 reduced the HTTP client's connection pool from 50 to 5 per route,
> through a configuration default that changed in the library upgrade included in that deploy.
> Under normal traffic, checkout requests queued for connections and timed out.
>
> **Trigger:** normal afternoon traffic. Nothing unusual happened; the change was sufficient on
> its own, which is why it was not caught in staging where traffic is 3% of production.
>
> **Evidence:** replay at the observed request rate reproduces connection waits with a pool
> of 5; the previous setting clears them. Staging did not exercise that rate.
>
> **Mitigation:** rollback completed 14:31; request errors returned to baseline and remained
> there through 15:00.
>
> **Change deployed:** pool size set explicitly and asserted in a configuration test.
> Deployed 15:10; post-deployment validation is pending. The rollback observation window
> does not validate this later deployment.
>
> **Remaining:** Checkout owns checking error rates and connection waits under representative
> traffic against the agreed recovery criteria before marking the change verified. The client's
> connection-pool saturation is not on a dashboard — we found this from a thread dump. Platform
> owns pool-wait metrics and an alert (PLAT-882), due Friday; validate the alert with a controlled
> saturation exercise before closing the ticket.

The "remaining" section is the part that prevents the next occurrence, and it is the part most
often omitted because the incident feels over.

## What to leave out of all of these

- Investigation chronology that does not explain a decision; keep the detailed incident
  timeline in the linked incident record when it is needed for audit or learning.
- Apology beyond a clause. Repeated apology asks the reader to reassure you, which is work.
- Hedging that removes the claim: "it may possibly be the case that there could be an issue".
- Personal blame. Keep action owners and necessary accountability; avoid unsupported
  character judgments and unnecessary identifying details in broad updates.
- Certainty about a cause you have not confirmed.

## Sources

- [Google SRE: Managing Incidents](https://sre.google/sre-book/managing-incidents/): communication ownership, periodic updates and a shared incident record.
- [Google SRE: Postmortem Culture](https://sre.google/sre-book/postmortem-culture/): blameless causal analysis and follow-up actions. These practices support the patterns; the examples above are invented teaching scenarios.
