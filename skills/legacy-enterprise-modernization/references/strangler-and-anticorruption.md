# Strangler and Anti-Corruption Layer

## Choosing the interception point

The strangler works by putting something in front of the legacy system that can route
per-case. Prefer a boundary that already exists — it is already a contract, and something
already speaks it.

Not Feathers's sense of the term: his interception point _observes_ the effect of a change so a
test can see it (`java-legacy-code-testing`). This one _diverts_ traffic.

| Interception point           | Fits when                                               | Cost                                                  |
| ---------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| HTTP reverse proxy / gateway | The legacy exposes HTTP                                 | Cheapest; routing per path or per header              |
| A facade service in front    | Routing needs business logic (per tenant, per customer) | A component to build and operate                      |
| Message broker topic         | The boundary is already asynchronous                    | Cheapest of all where it applies                      |
| Inside the monolith          | No external boundary exists at the seam                 | Requires the seam to exist in code first              |
| Database triggers / CDC      | Nothing else is available                               | Last resort: invisible coupling, hard to reason about |

The in-monolith case is worth stating because it is the common one: the first strangler step
is frequently _inside_ the legacy application — introduce the interface, implement it twice,
route by flag — with no infrastructure at all.

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

1. **Who wins on disagreement** during the shadow period (the legacy, until proven
   otherwise).
2. **Who investigates a divergence**, and within what time.
3. **What divergence rate is acceptable** to proceed — it is rarely zero, because legacy
   behaviour includes rounding quirks and data anomalies.
4. **How long the shadow runs**, and over which cases — including month-end and other
   periodic paths, which are exactly where a legacy system's oddest rules live.

Without those four, parallel run produces a stream of alerts nobody actions, and the
migration stalls because nobody will sign off the switch.

This synchronous sketch isolates ordinary shadow/diagnostic exceptions, not hangs, resource
exhaustion or JVM-fatal failures. Use it only for bounded read-only computation within the
request's spare budget. For expensive work, use separately bounded replay/shadow execution
with an overload/drop policy. Suppress external effects (charges, messages, emails) or use an
isolated sink; invoking both production write paths is not safe shadowing. Compare equivalent
inputs/state and control clocks/randomness before interpreting divergences as defects.

## The anti-corruption layer

Its purpose is to stop the legacy model's concepts from entering the new one. It is not a
mapper: it may drop fields, merge records, reinterpret codes and invent concepts the legacy
does not have.

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
- Filtering out records the new model does not recognise.
- **Deriving concepts the legacy lacks**, in one place, with tests.
- Translating failures into the new model's terms.

### What must not

- Business rules the new model should own. The ACL derives a `tier` from legacy data; it
  does not decide what a premium customer may do.
- Caching decisions (that is a separate concern with its own trade-offs).
- Writes back into the legacy without an explicit, separate decision — a two-way ACL is two
  layers, and the write direction usually needs the legacy's own validation to run.

### It will be ugly, and that is correct

The ACL holds the mismatch. Left out, the mismatch is distributed through the new code as
special cases forever. Concentrating the ugliness in one tested, documented class is the
pattern's entire value — and it is also what makes the ACL deletable on the day the legacy
goes.

## Decommissioning

The step that realises the benefit, and the one that gets postponed.

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
Slice selection, in order of preference:
    1. Changes often (the pain is real and recurring)
    2. Reasonably self-contained (few writers to its data)
    3. Failure is survivable (not the payment path first)
    4. Has an existing boundary (an endpoint, a queue, a file)

NOT: the most technically interesting, the most broken, or the largest.
```

Prove at least one representative slice end to end—including decommissioning—before scaling the
pattern broadly. Parallel slices can be justified for independent teams or business deadlines, but
cap work in progress and account for every coexistence path operationally.
