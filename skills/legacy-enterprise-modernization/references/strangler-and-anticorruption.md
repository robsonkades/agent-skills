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

- **Route per case**, not globally: per tenant, per customer, per order type. A global switch
  has one blast radius — everything.
- **The flag is data, not a deploy.** Rolling back must not require a release.
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
        divergences.recordFailure(orderId, e);            // never fails the request
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

Note the shape: the shadow call is wrapped so it can never fail the request, and divergences
are recorded (sampled, structured) rather than logged at volume.

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
1. Prove disuse       Instrument the legacy path. Zero traffic for a
                      defined period INCLUDING the periodic paths
                      (month-end, year-end, the quarterly report).

2. Disable            Make the legacy path fail loudly rather than
                      deleting it. Keep it for one release cycle. This
                      surfaces the caller nobody knew about.

3. Delete             Code, jobs, configuration, monitoring, credentials,
                      firewall rules, the runbook page.

4. Data               Archive per the retention requirement, then drop
                      the tables. Usually the longest wait, and it should
                      have a date rather than a condition.

5. Decommission       The server, the licence, the vendor contract. This
                      is where the money is, and it needs someone
                      accountable outside engineering.
```

**Step 1's periodic caveat is not pedantry.** A legacy path with no traffic for three weeks
may still be the month-end invoicing run. The observation window must cover the longest
business cycle the code participates in.

## Sequencing the whole programme

```text
Slice selection, in order of preference:
    1. Changes often (the pain is real and recurring)
    2. Reasonably self-contained (few writers to its data)
    3. Failure is survivable (not the payment path first)
    4. Has an existing boundary (an endpoint, a queue, a file)

NOT: the most technically interesting, the most broken, or the largest.
```

Ship the first slice end to end — including decommissioning its legacy path — before
starting the second. A programme with five slices in flight and none finished has learned
nothing about whether its approach works, and has five parallel runs to operate.
