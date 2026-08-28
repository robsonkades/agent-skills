# Worked selections

Each scenario runs the same four steps: name the risk, find the narrowest scope where it is
real, note what that level cannot prove, and state what was deliberately not written.

## 1. A new pricing rule

> "Orders over 500 in the EU get a 3% discount, applied before VAT, rounded half-up to cents."

**Risk:** the calculation and its boundaries — exactly 500, currency rounding, order of
discount and VAT.

**Narrowest real scope:** a pure unit test on the pricing type. No database is involved in
being wrong about 500.00 versus 500.01.

**Chosen:** parameterised unit tests over the boundary values (499.99, 500.00, 500.01), one
per rounding direction, one asserting discount-then-VAT rather than VAT-then-discount.

**Not written:** a `@SpringBootTest` that places an order and checks the total. It would run
200× slower, and when a rounding rule breaks it would report "expected 1234, got 1235" from
six layers away.

**Gap accepted:** nothing proves the rule is reachable from the controller. Covered already
by the one end-to-end journey for checkout.

## 2. A new repository query

> "Find all active subscriptions renewing in the next 7 days, newest first, paginated."

**Risk:** the SQL. Derived-query naming, the date boundary in the engine's own semantics,
sort stability under pagination, and whether an index exists.

**Narrowest real scope:** integration, against the real engine. A mocked repository proves
only that you can stub a method; H2 proves a dialect nobody deploys.

**Chosen:** one Testcontainers test with the real engine and the real migrations, seeding
rows either side of the 7-day boundary and asserting the returned ids in order. A second
assertion that page 2 does not repeat a row from page 1 — the classic unstable-sort defect
when the sort key is not unique.

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

**Gap accepted:** if the provider changes its response shape without telling us, only
production will notice. That is a monitoring problem (slo-and-alerting), not a test problem —
say so rather than pretending a test covers it.

## 4. A schema migration

> "Split `customer.name` into `given_name` and `family_name`."

**Risk:** the migration itself — does it apply to a database that already has rows, is it
reversible, does the application still start against both the old and the new schema during
the rolling deploy.

**Narrowest real scope:** integration. There is no unit-testable content here at all.

**Chosen:** one test that applies the full migration history from empty to head against the
real engine (this catches a migration that only works on a fresh database), and one that
seeds pre-migration rows, applies the migration, and asserts the backfill.

**Not written:** assertions about column types via reflection over the entity. They test the
annotations, not the schema.

## 5. A bug report

> "Customer 88123 saw a negative balance after a refund."

**Order matters.** Reproduce before diagnosing, and write the reproduction as a test.

1. Reproduce at the level where it actually happens. Start end-to-end only if narrower
   attempts fail — and if only end-to-end reproduces it, the cause is in wiring or state, and
   that is itself the finding.
2. Shrink the reproduction until removing anything makes it pass. Usually it collapses to a
   unit test over one method with one input.
3. Watch it fail, and read the failure message. A reproduction that fails for a different
   reason than the report describes is not a reproduction.
4. Fix. The same test now passes, and it is the regression test — no second one is needed.

**Not written:** a test asserting the balance is non-negative everywhere. That is an invariant
belonging in the type (java-design-by-contract), not a test to be repeated at each call site.

## The recurring shape

In every scenario, the level is chosen by asking _where can this specific thing be wrong_,
never by asking _what level are we short of_. Suites that were built to hit a ratio contain
many tests that could not fail and few that could.
