# Writing acceptance criteria

A criterion is useful when two people would agree on whether it is met, without discussing the
implementation. Everything below serves that one property.

## The level of abstraction

| Too low (implementation)                     | Right (behaviour)                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| "`OrderService.export()` returns a `byte[]`" | "The user receives a CSV file containing their own orders"               |
| "A row is inserted into `audit_log`"         | "An administrator can see who exported which customer's data"            |
| "The Redis cache is populated"               | "The response meets the agreed latency and freshness contract"           |
| "The method throws `OrderNotFound`"          | "An unknown order receives the agreed non-disclosing not-found response" |

The right-hand column survives a rewrite of the implementation. The left-hand column is a test
of the design, and it makes every refactoring look like a requirement change.

The exception: when the _mechanism_ is the requirement — a regulator requires an audit row, a
contract requires a specific header — say so, and note why the mechanism is fixed. Otherwise
future readers cannot tell a constraint from an accident.

## Given / When / Then, and where it misleads

```
Given a customer with 3 orders, one of them cancelled
When they export their orders
Then the file contains 3 data records (plus the agreed header),
and the cancelled order shows status "CANCELLED"
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

Use measurable scenarios and explicit conditions where appropriate. Qualitative constraints
can instead name a verifiable rule or review method. The following numbers and policies are
hypothetical examples, not defaults to impose:

> **Latency.** p99 of `GET /orders` stays under 200 ms at 500 requests/second, measured at the
> service over a specified steady-state window and workload mix, with dependency latency
> defined by a measured distribution. Record errors, timeouts and achieved arrival rate too.

> **Availability.** The endpoint serves successfully for 99.9% of requests over a calendar
> month, excluding scheduled maintenance windows announced 24 hours ahead.

> **Data retention.** Export audit records are retained for 7 years and are not deleted by the
> personal-data erasure process **only if the applicable, authorized retention policy requires
> this scope**. Determine retained fields and access controls; do not infer a legal exemption.

Before accepting such criteria, finish specifying population, window, measurement boundary
and exclusions. "p99 under 200 ms" without these is underspecified, not proof that it will
pass at low load or fail at high load. Scheduled-maintenance exclusions need existing
agreement; do not add them merely to improve the reported availability.

The measurement point matters more than people expect: p99 at the load balancer, at the service
and at the client use different boundaries and possibly different request populations. Arguments about whether an SLO was
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
no derivable automated test may need manual observation or review. State that method and
its evidence; rewrite the criterion only if its outcome remains unobservable.

## Definition of done

The standing policy that defines default expectations, with explicit applicability rules so a
documentation edit is not forced to invent a migration or runtime signal. An illustrative set to adapt to existing policy, not new mandatory gates:

- [ ] Each applicable criterion has evidence and a met/unmet/unverified status; missing tests or measurements are not a pass
- [ ] Gates appropriate to the change's risk pass (quality-gates)
- [ ] Failure behaviour implemented where the change introduces or alters a failure mode
- [ ] For data/schema changes, migration applies to existing data and recovery/rollback semantics are described
- [ ] For operational behaviour, existing telemetry covers the new failure mode or new telemetry is added
- [ ] Assumptions and out-of-scope items recorded in the description
- [ ] Review performed when required by existing policy (code-review)

The value is in stable defaults plus visible exceptions. Tailoring by applicability is not waiving
quality; silently deleting a relevant control under deadline is.

A load test demonstrates its workload and window, not a month's future availability. A
single two-user fixture does not establish authorization for every role and resource; add
cases for the changed access rules. Keep acceptance evidence separate from a claim of
exhaustive correctness.
