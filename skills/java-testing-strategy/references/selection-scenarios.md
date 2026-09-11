# Worked selections

Each scenario runs the same four steps: name the risk, find the narrowest scope where it is
real, note what that level cannot prove, and state what was deliberately not written.

## 1. A new pricing rule

> "Orders over 500 in the EU get a 3% discount, applied before VAT, rounded half-up to cents."

**Risk:** the calculation and its boundaries — exactly 500, currency rounding, order of
discount and VAT.

**Narrowest real scope:** a pure unit test on the pricing type. No database is involved in
being wrong about 500.00 versus 500.01.

**Chosen:** parameterised unit tests over the boundary values (499.99, 500.00, 500.01),
region eligibility, and rounding including a half-cent tie. This is a fictional business
rule, not tax guidance. Specify the intermediate rounding policy before testing operation
order: exact percentage multiplications commute, so final totals alone may not distinguish
discount-then-VAT from VAT-then-discount.

**Not written:** a `@SpringBootTest` that places an order and checks the total. It may
incur context setup (measure the actual cost), and a rounding failure would be reported from
six layers away.

**Gap:** inspect the existing checkout test before claiming reachability is covered. It must
exercise an eligible order and an observable discounted result; otherwise add a focused
wiring case or explicitly accept the gap.

## 2. A new repository query

> "Find all active subscriptions renewing in the next 7 days, newest first, paginated."

**Risk:** the SQL. Derived-query naming, the date boundary in the engine's own semantics,
sort stability under pagination, and whether the migration creates the intended index.

**Narrowest real scope:** integration, against the real engine. A mocked repository proves
only the caller's behavior under the stubbed assumptions. Use the deployed engine, including
H2 when that is the actual target; H2 compatibility mode does not establish another engine's
SQL, locking or planning behavior.

**Chosen:** one real-engine integration test (Testcontainers when appropriate) with the real migrations, seeding
rows either side of the 7-day boundary and asserting the returned ids in order. A second
assertion that page 2 does not repeat a row from page 1 — the classic unstable-sort defect
when the sort key is not unique. Seed equal sort keys and require an explicit unique
tie-breaker in the query; one nonrepeating run cannot prove unspecified order is stable.
Check index existence separately. This small fixture cannot establish production query cost.

**Not written:** unit tests of the service that calls it, beyond one proving it passes the
caller's page size through. That logic is one line.

## 3. A call to a third-party API

> "Fetch the customer's credit score from an external provider before approving."

**Risk:** two separate ones, and they belong at different levels. (a) What we do with the
answer — approve, decline, degrade on timeout. (b) That we speak the provider's protocol.

**Narrowest real scope for (a):** unit, against our own port interface. Stub it to return a
high score, a low score, a timeout, a 500. Assert the decision each time.

**Narrowest real scope for (b):** an adapter test against a stub server (WireMock) using a
response body captured from the real provider, plus a contract test if the provider
publishes one.

**Chosen:** both. They are cheap and they fail for different reasons.

**Not written:** any test that calls the real provider in CI. It makes the build depend on
someone else's uptime and rate limit, and it cannot produce the timeout case on demand.

**Gap:** a recorded response cannot detect provider drift. Use provider verification if
available, or consider a scheduled sandbox compatibility check outside the fast CI gate.
Record its freshness and limitations; without either, accept the gap explicitly and monitor
production failures (slo-and-alerting). Sanitize captured customer data and credentials.

## 4. A schema migration

> "Split `customer.name` into `given_name` and `family_name`."

**Risk:** the migration itself — does it apply to a database that already has rows, is it
reversible, does the application still start against both the old and the new schema during
the rolling deploy.

**Narrowest real scope:** real-engine integration for DDL and data effects. Any extracted
name-splitting policy can also have unit cases, especially ambiguous or single-part names.

**Chosen:** one test that applies the full migration history from empty to head against the
real engine (fresh installation), and one that seeds the previous schema, applies the
migration, and asserts the backfill (upgrade). For the stated rolling-deploy risk, exercise
old and new application versions against each schema they actually overlap with, following
the expand/contract plan. Decide whether recovery uses rollback or forward repair; a
successful forward migration proves neither recovery nor rolling compatibility.

**Not written:** assertions about column types via reflection over the entity. They test the
annotations, not the schema.

## 5. A bug report

> "Customer 88123 saw a negative balance after a refund."

**Seek a reproduction before claiming a cause**, and preserve it as a test when feasible.
If the failing revision or environment is unavailable, report that limit separately from a
current passing regression test; a controlled defect check may help but is not a historical run.

1. Reproduce at the level where available evidence makes the risk real. A known process or
   wiring boundary can justify starting end-to-end; unsuccessful narrower attempts are not a
   prerequisite. If only end-to-end reproduces it, wiring or shared state remain hypotheses;
   retain the reproduction until narrower evidence identifies the cause.
2. Shrink the reproduction until removing anything makes it pass. Usually it collapses to a
   smaller test; do not remove essential transactions, concurrency or environmental triggers.
3. Watch it fail, and read the failure message. A reproduction that fails for a different
   reason than the report describes is not a reproduction.
4. Fix. The same test now passes, and it is the regression test — no second one is needed.

**Not written:** the same non-negative assertion at every call site. Confirm whether that is
the actual balance/refund invariant; if so, test it at its owning boundary
(java-design-by-contract). Do not infer an overdraft policy from the symptom alone.

## The recurring shape

In every scenario, the level is chosen by asking _where can this specific thing be wrong_,
never by asking _what level are we short of_. Suites that were built to hit a ratio contain
many tests that could not fail and few that could.
