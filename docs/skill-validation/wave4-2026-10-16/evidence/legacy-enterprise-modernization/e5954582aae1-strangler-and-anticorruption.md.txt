# Strangler and Anti-Corruption Layer

## Choosing the interception point

The strangler works by putting something in front of the legacy system that can route
per-case. Prefer a boundary that already exists — it is already a contract, and something
already speaks it.

Not Feathers's sense of the term: his interception point _observes_ the effect of a change so a
test can see it (`java-legacy-code-testing`). This one _diverts_ traffic.

| Interception point           | Fits when                                               | Check before choosing                                |
| ---------------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| HTTP reverse proxy / gateway | The legacy exposes HTTP                                 | Routing key, state compatibility and proxy operation |
| A facade service in front    | Routing needs business logic (per tenant, per customer) | Ownership and cost of another component              |
| Message broker topic         | The boundary is already asynchronous                    | Consumer routing, ordering and delivery contracts    |
| Inside the monolith          | A code seam can isolate the affected functionality      | Dependency breaking and release coupling             |

CDC is a data propagation seam, not by itself a per-request router. It can support a
database migration when capture, ordering, replay and catch-up contracts are available.
Trigger-based propagation adds effects to database writes; inspect its transaction and
failure coupling. Neither is universally a last resort or a cheapest option.

An in-monolith extraction can introduce an interface, implement it twice and route by flag
without adding infrastructure. Choose the seam from the actual contract and migration cost.

## Routing a slice

Partial Spring application snippets below omit constructor injection and domain types.

```java
@Component
class OrderPricingRouter implements PricingPort {

    private final LegacyPricing legacy;
    private final NewPricing modern;
    private final FeatureFlags flags;

    @Override
    public Money priceFor(OrderId orderId) {
        return flags.isEnabled("pricing.modern", orderId)
            ? modern.priceFor(orderId)
            : legacy.priceFor(orderId);
    }
}
```

Requirements that make this safe:

- Route at the smallest key that preserves consistency and supportability. Per-tenant/order routing
  reduces blast radius but can split workflows or related data; a global/region switch may be safer
  when state cannot straddle implementations.
- Prefer an operational routing switch where feasible, but test data compatibility too:
  old code must understand state written after cutover. After incompatible writes, reverting
  a flag or binary is not a rollback plan; require reverse synchronization or forward repair.
- **Someone owns each case.** "Which implementation served this request?" must be answerable
  from the logs, always.

## Parallel run, with a policy decided in advance

```java
@Override
public Money priceFor(OrderId orderId) {
    Money legacyResult = legacy.priceFor(orderId);        // authoritative during shadow
    try {
        Money modernResult = modern.priceFor(orderId);
        if (!legacyResult.equals(modernResult)) {
            divergences.record(orderId, legacyResult, modernResult);   // sampled, not logged raw
        }
    } catch (RuntimeException e) {
        try {
            divergences.recordFailure(orderId, e);
        } catch (RuntimeException telemetryFailure) {
            // Best-effort diagnostics must not replace the authoritative result.
        }
    }
    return legacyResult;
}
```

Before switching this on, decide and write down:

1. **Which path owns responses and effects** during shadowing (the legacy in this sketch).
   This does not make every legacy result the desired contract: record approved changes
   separately from unexplained differences.
2. **Who investigates a divergence**, and within what time.
3. **Which invariants and differences permit cutover.** Set acceptance by consequence and
   coverage; money or integrity contracts may require zero unexplained differences. Test
   approved rounding or policy changes against their intended results, not an arbitrary
   allowable error rate.
4. **Which cases and observation period cover the affected contract**, including relevant
   periodic paths through observation or controlled replay.

Without those four, parallel run produces a stream of alerts nobody actions, and the
migration stalls because nobody will sign off the switch.

This synchronous sketch isolates ordinary shadow/diagnostic exceptions, not hangs, resource
exhaustion or JVM-fatal failures. Use it only for bounded read-only computation within the
request's spare budget. For expensive work, use separately bounded replay/shadow execution
with an overload/drop policy. Suppress external effects (charges, messages, emails) or use an
isolated sink; invoking both production write paths is not safe shadowing. Compare equivalent
inputs/state and control clocks/randomness before interpreting divergences as defects.

## The anti-corruption layer

Use an ACL when the connected models have meaningful semantic differences. It may combine
mapping, validation and interpretation to preserve the consuming model's contract. When
concepts already match, a gateway or projection may suffice. The example assumes that only
master records belong to the lookup contract, the shown status-to-tier mapping is agreed,
and the gateway rejects master records with unknown required status codes. That validation
is an explicit precondition of this partial sketch, not supplied by the mapping below.

```java
// Legacy: one table, 140 columns, three record types distinguished by TIPO_REG,
// dates as strings, amounts in cents as integers, status as a two-letter code.
@Component
class LegacyCustomerAcl implements CustomerDirectory {

    private final LegacyCustomerGateway gateway;

    @Override
    public Optional<Customer> byTaxId(TaxId taxId) {
        return gateway.findByCgc(taxId.digits())
            .filter(row -> "01".equals(row.tipoReg()))       // only master records
            .map(this::toCustomer);
    }

    private Customer toCustomer(LegacyCustomerRow row) {
        return new Customer(
            new CustomerId(row.codCli()),
            new TaxId(row.cgc()),
            tierFrom(row.codSit(), row.vlrLimite()),         // two legacy fields → one concept
            Money.ofCents(row.vlrLimite(), BRL),
            parseLegacyDate(row.dtCad()));
    }

    private CustomerTier tierFrom(String situationCode, long limitCents) {
        // Precondition: the gateway validated this code against the source contract.
        // Only agreed non-AT statuses may reach the INACTIVE fallback.
        // The legacy has no "tier". It is derivable, and this is the only place
        // that knows how. Documented, tested, and contained.
        if ("AT".equals(situationCode) && limitCents > 10_000_00) return CustomerTier.PREMIUM;
        if ("AT".equals(situationCode)) return CustomerTier.STANDARD;
        return CustomerTier.INACTIVE;
    }
}
```

### What belongs in it

- Translation of vocabulary, codes, formats and units.
- Filtering records deliberately outside the agreed contract. Surface unknown required
  records/codes for handling rather than silently losing them.
- **Deriving concepts the legacy lacks**, in one place, with tests.
- Translating failures into the new model's terms.

### What must not

- Business rules the new model should own. The ACL derives a `tier` from legacy data; it
  does not decide what a premium customer may do.
- Caching decisions (that is a separate concern with its own trade-offs).
- Writes back into the legacy without an explicit decision. Define the write direction's
  authority, validation and failure contract separately; two directions do not require two
  deployed components.

### Contain the mismatch and own its lifecycle

Keep the necessary translation tested and local to the boundary. Retire it when its callers
and semantic dependency disappear; if it remains a supported integration contract, retain
an owner and account for its maintenance cost.

## Decommissioning

Use these gates when retirement is part of the slice's intended outcome.

```text
1. Establish disuse   Combine instrumented traffic with caller/owner and
                      recovery contracts, including evidence for periodic
                      paths (month-end, year-end, quarterly reports).

2. Disable            Use a bounded cohort/observation period, alerts and
                      a tested recovery path. Do not deliberately break
                      unknown critical callers to discover them.

3. Delete             Code, jobs, configuration, monitoring, credentials,
                      firewall rules, the runbook page.

4. Data               Archive per retention/recovery requirements and verify
                      restore. Drop only after consumer, ownership and
                      rollback gates pass; a target date does not replace them.

5. Decommission       The server, the licence, the vendor contract. This
                      is where the money is, and it needs someone
                      accountable outside engineering.
```

**Step 1's periodic caveat is not pedantry.** A legacy path with no traffic for three weeks
may still be the month-end invoicing run. Cover relevant cycles with observation or
controlled replay and owner/contract evidence for rare paths not observed live.

## Sequencing the whole programme

```text
Slice selection factors, weighed against business deadlines and risk:
    1. Changes often (the pain is real and recurring)
    2. Reasonably self-contained (few writers to its data)
    3. Failure and recovery are containable
    4. Has an existing boundary (an endpoint, a queue, a file)

Technical interest, code ugliness or size alone do not establish value.
```

Prove at least one representative slice end to end—including retirement where intended—before
scaling the pattern broadly. Parallel slices can be justified for independent teams or business deadlines, but
cap work in progress and account for every coexistence path operationally.

## Primary references

- [Azure anti-corruption layer](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer) — semantic mismatch, implementation scope and retained integration layers.
- [Azure Strangler Fig](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig) — bounded replacement alternatives, retained facades and CDC during database migration.
