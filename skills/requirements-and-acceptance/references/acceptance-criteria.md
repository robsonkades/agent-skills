# Writing acceptance criteria

A criterion needs an observable pass condition that two people can interpret consistently.
The set must also cover the intended need: agreement that a check passed does not establish
that the right behavior was specified.

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
Then the file contains exactly those 3 orders, each once (plus the agreed header),
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

## Check coverage against the intended use

**Verification** checks conformance to the stated criteria; **validation** checks whether
the result serves the intended purpose in its intended environment. Use a representative
consumer workflow to check the connection before declaring the criteria ready. These are
different questions, not a requirement for two separate test suites or a new approval gate.

For example, if the known need is to reconcile every selected order, a check for three CSV
records accepts both `A,B,C` and `A,A,C`. It cannot detect the missing order. The criterion
must cover each selected order exactly once; field fidelity and selection rules need their
own relevant checks. A count can remain useful evidence, but cannot substitute for identity.
Conversely, a consumer that only needs aggregate totals has a different contract; do not add
individual-order export merely to satisfy this example.

Link consequential criteria to the stated need or binding constraint and explain any proxy.
For the relevant workflow, follow an actual actor or consumer from the entry point through the
operation to where the result is observed, using source, tests or documented usage. Record the
few paths or source links that establish this connection. A worker's success log may be useful
evidence without showing that the consumer received a usable result. For new behavior, keep
the intended observation point distinct from what exists or has been exercised today.
If the workflow is unknown and changes the contract, inspect usage first, then ask the focused
question; an unavailable source or failed search does not settle the requirement. For a business
outcome observable only after release, distinguish delivery checks from that still-unverified
outcome; do not invent a target, run an experiment outside the request, or impose a new release gate.

## Preserve conditions when rewriting

Compare changed criteria with their requirement or accepted clarification, not just with the
current implementation. Preserve qualifiers that change the permitted outcomes: actor and
resource scope, "only", "every" or "at most once", inclusive/exclusive bounds, timing, ordering
and failure or retry conditions. Check both directions: each material source condition has a
covering criterion or an explicit unresolved question, and each added condition has authority
or is labeled proposed. Existing identifiers or short source links suffice.

For example, "A reviewer may approve a request at most once, only if it is assigned to that
reviewer and still pending when approval is applied" is weakened by "Selected requests can be
approved." Keep the assignment, current-state and duplicate-effect constraints when deriving
success and rejection cases; a successful approval alone does not exercise them. Splitting
the rules into separate criteria must not erase their combined applicability.

A wording edit or handoff is not authority to relax a condition. When an accepted clarification
does change it, preserve the source and reason and review the affected checks as described below.

## Time and state in acceptance criteria

When processing continues after a response, specify acknowledgment and completion separately.
For HTTP, `202 Accepted` means processing was accepted, not completed; it does not guarantee
the eventual outcome ([RFC 9110, section 15.3.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.3)).
A job ID or a "ready" flag alone does not establish that the consumer can obtain the promised
result. Name the observable result and how the consumer recognizes success or failure using
the agreed interface; do not prescribe polling, callbacks or a new queue merely to write a criterion.

For a timing promise, name the starting event, the required visible state and the agreed bound
under the specified conditions. Keep an absent bound unresolved instead of inventing a default
or accepting "eventually" as a finite check. Specify what happens if completion fails or the
consumer stops waiting: a timeout observation is not evidence that cancellation or cleanup occurred.
With a valid observation spanning the agreed start and deadline, absent required visible completion
can make that timing criterion unmet while the eventual effect remains unverified. Without that
coverage, keep the timing result unverified too; do not turn a disconnected observer into a verdict.
If partial output is permitted, state how it is distinguished from a complete result and which
guarantees still hold; do not silently treat a partial file as success or ban it without a requirement.

For changing data, define the expected membership and field versions before asserting
"every selected order exactly once." A point-in-time export and a live traversal have different
contracts. Suppose orders A and B qualify at the agreed cutoff, then B changes and C is added
while the export runs. A snapshot contract checks A and B with their cutoff values and excludes
C; a live contract must state which later changes may appear and any completeness/duplicate
guarantees it still promises. Use controlled changes between reads to check the chosen contract.
Do not infer snapshot semantics from deterministic sorting, or choose a database isolation level
in place of establishing the consumer's required view.

## Cover the unhappy paths explicitly

Criteria that only describe success leave the failure behaviour to whoever implements it, and
their choice becomes the requirement by default. Each of these deserves its own criterion when
it applies:

- The input is invalid — what does the caller see, and is it their fault or ours?
- The dependency is unavailable — fail, degrade, queue, or serve stale?
- The operation is repeated — same result, or a second effect?
- The user is not permitted — 403 or 404? (Revealing existence is sometimes the leak.)
- Nothing matches — empty result or an error? These are different requirements.

### Consumer behavior is part of an export contract

For the CSV example, confirm the intended consumers before selecting criteria such as:

- **Spreadsheet use:** customer-supplied text is treated as text, not evaluated as a
  formula, in the named application/version and agreed opening or import workflow.
  Include save/reopen only when that workflow is supported; record the permitted text
  representation instead of assuming a prefix is invisible to every consumer.
- **Lossless machine import:** the agreed string fields round-trip to their original values
  through the supported parser; spreadsheet-oriented prefixes must not silently alter them.

Use adversarial fixtures with formula-like text (`=1+1`, `+1+1`, `-1+1`, `@SUM(1,1)`),
embedded delimiters, quotes and newlines. Check that field content cannot create extra
cells/records and that the required consumer interpretation holds. A CSV parser round-trip
checks data and structure; it does not prove a spreadsheet will avoid formula evaluation.
If the consumer cannot be exercised, that part remains unverified.

When both uses are required, assess whether the agreed representation satisfies both; surface
any incompatibility before changing data or excluding a requested consumer. These are
conditional acceptance examples, not a universal escaping recipe; see the
[consumer question and sources](ambiguity-checklist.md#worked-example).

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
| "p99 under 200 ms at 500 rps"                         | A load test, not a unit test                                      |

Choose the level per the risk each criterion carries (java-testing-strategy). A criterion with
no derivable automated test may need manual observation or review. State that method and
its evidence; rewrite the criterion only if its outcome remains unobservable.

When a criterion requires load-test evidence, use `load-testing` to design the workload
and measurement procedure after the acceptance target and conditions are agreed.

When a requirement changes, trace the effect through the relevant criteria, tests and other
evidence. For example, changing an export from all orders to only settled orders changes the
expected selection; an earlier all-orders test pass does not establish the new criterion. Reuse
evidence whose conditions and claims still apply, and rerun or replace affected checks.
Record the authorized change in the existing ticket/PR or requested output; a new traceability
system is unnecessary for a small task. A failed check alone is not authority to change the
requirement, and an old check alone is not authority to reject an authorized new contract.

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

## Supporting sources

- [NASA Systems Engineering Handbook, appendix C](https://www.nasa.gov/reference/appendix-c-how-to-write-a-good-requirement/)
  covers unambiguous, verifiable requirements, timing, interfaces, failure responses and sequence assumptions.
- [PostgreSQL 17 transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html)
  illustrates why successive reads and one consistent snapshot are different guarantees;
  this example does not mandate PostgreSQL or an isolation level for the target project.
- [NASA Systems Engineering Handbook, section 2.4](https://www.nasa.gov/reference/2-0-fundamentals-of-systems-engineering/)
  distinguishes conformance verification from validation of intended use.
- [NASA Systems Engineering Handbook, section 6.2](https://www.nasa.gov/reference/6-2-requirements-management/)
  describes requirement sources, checking derived requirements against their parents, traceability
  and change-impact analysis. Apply those reasoning principles proportionately;
  its NASA-specific approval machinery is not project
  policy.
