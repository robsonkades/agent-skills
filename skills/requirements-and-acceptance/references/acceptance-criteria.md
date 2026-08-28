# Writing acceptance criteria

A criterion is useful when two people would agree on whether it is met, without discussing the
implementation. Everything below serves that one property.

## The level of abstraction

| Too low (implementation)                     | Right (behaviour)                                               |
| -------------------------------------------- | --------------------------------------------------------------- |
| "`OrderService.export()` returns a `byte[]`" | "The user receives a CSV file containing their own orders"      |
| "A row is inserted into `audit_log`"         | "An administrator can see who exported which customer's data"   |
| "The Redis cache is populated"               | "A repeated request within 60 s does not re-query the database" |
| "The method throws `OrderNotFound`"          | "Requesting an unknown order returns 404 with the order id"     |

The right-hand column survives a rewrite of the implementation. The left-hand column is a test
of the design, and it makes every refactoring look like a requirement change.

The exception: when the _mechanism_ is the requirement — a regulator requires an audit row, a
contract requires a specific header — say so, and note why the mechanism is fixed. Otherwise
future readers cannot tell a constraint from an accident.

## Given / When / Then, and where it misleads

```
Given a customer with 3 orders, one of them cancelled
When they export their orders
Then the file contains 3 rows, and the cancelled order shows status "CANCELLED"
```

It works because it forces the precondition to be stated — which is where the ambiguity usually
hides. Two ways it goes wrong:

- **Given becomes a database script.** "Given a row in `orders` with `status_id = 4`" has moved
  back into implementation. Say what is true in the domain.
- **Then contains several unrelated assertions**, so a failure does not identify which rule
  broke. One rule per criterion; the same discipline as one reason to fail in a test
  (java-test-design).

The form is optional. A plain sentence naming the condition and the observable outcome is
equally good, and better when the Given is trivial.

## Cover the unhappy paths explicitly

Criteria that only describe success leave the failure behaviour to whoever implements it, and
their choice becomes the requirement by default. Each of these deserves its own criterion when
it applies:

- The input is invalid — what does the caller see, and is it their fault or ours?
- The dependency is unavailable — fail, degrade, queue, or serve stale?
- The operation is repeated — same result, or a second effect?
- The user is not permitted — 403 or 404? (Revealing existence is sometimes the leak.)
- Nothing matches — empty result or an error? These are different requirements.

## Non-functional criteria

Written as a scenario with a number and a condition, or they cannot be checked:

> **Latency.** p99 of `GET /orders` stays under 200 ms at 500 requests/second, measured at the
> service, with the database responding within 20 ms.

> **Availability.** The endpoint serves successfully for 99.9% of requests over a calendar
> month, excluding scheduled maintenance windows announced 24 hours ahead.

> **Data retention.** Export audit records are retained for 7 years and are not deleted by the
> personal-data erasure process.

Each names what is measured, where, under what conditions, and over what window. "p99 under
200 ms" without the load and the measurement point is unfalsifiable — it is true at 1 rps and
false at 5000.

The measurement point matters more than people expect: p99 at the load balancer, at the service
and at the client differ by the network and by queueing, and arguments about whether an SLO was
met are usually arguments about which one was meant (latency-statistics, slo-and-alerting).

## From criteria to tests

Criteria and tests are not the same artefact, and one criterion is often several tests:

| Criterion                                             | Tests it implies                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| "Orders over 500 in the EU get 3% off"                | Unit tests at 499.99 / 500.00 / 500.01; one for a non-EU customer |
| "The file contains only the requesting user's orders" | An integration test with two users' data present                  |
| "A repeated request within 60 s does not re-query"    | A test with a controllable clock, asserting the query count       |
| "p99 under 200 ms at 500 rps"                         | A load test, not a unit test (load-testing)                       |

Choose the level per the risk each criterion carries (java-testing-strategy). A criterion with
no derivable test is either not observable — rewrite it — or genuinely a matter of judgement, in
which case say it is verified by review rather than pretending otherwise.

## Definition of done

The standing list that applies to every change, agreed once so it is not renegotiated per
ticket. A realistic one:

- [ ] Acceptance criteria met, each with a test or a stated reason there is none
- [ ] Gates appropriate to the change's risk pass (quality-gates)
- [ ] Failure behaviour implemented, not just the happy path
- [ ] Migration applies to existing data, and rollback is described
- [ ] The change is observable: a log line, metric or trace for the new failure mode
- [ ] Assumptions and out-of-scope items recorded in the description
- [ ] Reviewed (code-review)

The value is in it being _standing_. A definition of done rewritten per ticket is a
negotiation, and under pressure the negotiation always removes the same three items.
