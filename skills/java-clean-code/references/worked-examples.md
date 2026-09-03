# Worked examples: splitting and merging

Both directions of the same judgement. The first method is too big because it mixes
abstraction levels; the second class is too small in every piece because state that should
be local was smeared across fields. Neither "long" nor "short" was the problem.

## Under-factored: a settlement method mixing three levels

### Before: under-factored settlement

```java
public BigDecimal settle(Settlement settlement) {
    if (settlement.entries().isEmpty()) {
        throw new IllegalArgumentException("empty settlement " + settlement.id());
    }
    BigDecimal gross = BigDecimal.ZERO;
    for (SettlementEntry entry : settlement.entries()) {
        if (entry.capturedAt().isAfter(settlement.cutoff())) {
            continue;
        }
        gross = gross.add(entry.amount());
    }
    BigDecimal fee;
    if (settlement.merchant().tier() == Tier.PLATINUM) {
        fee = gross.multiply(new BigDecimal("0.011"));
    } else if (gross.compareTo(new BigDecimal("50000")) > 0) {
        fee = gross.multiply(new BigDecimal("0.019"));
    } else {
        fee = gross.multiply(new BigDecimal("0.024"));
    }
    fee = fee.setScale(2, RoundingMode.HALF_EVEN);
    BigDecimal net = gross.subtract(fee);
    ledger.post(new LedgerEntry(settlement.merchant().accountId(), net,
            "SETTLE-" + settlement.id()));
    return net;
}
```

### Analysis: mixed abstraction levels

Not long by line count, but the reader changes altitude five times: what a settlement _is_
(gross minus fee, posted to the ledger), the fee _policy_ (tier and volume tiers), and
_mechanics_ (loop bookkeeping, rounding mode, reference-string assembly). The one-sentence
test fails: "sums captured entries **and** picks a fee rate **and** rounds **and** formats a
ledger reference **and** posts". The policy — the part a maintainer will be sent here to
change — is buried between mechanics.

### After: cohesive settlement flow

```java
public BigDecimal settle(Settlement settlement) {
    requireEntries(settlement);
    BigDecimal gross = grossBefore(settlement.cutoff(), settlement.entries());
    BigDecimal fee = feeFor(settlement.merchant(), gross);
    BigDecimal net = gross.subtract(fee);
    ledger.post(LedgerEntry.settlement(settlement, net));
    return net;
}

private static BigDecimal feeFor(Merchant merchant, BigDecimal gross) {
    BigDecimal rate;
    if (merchant.tier() == Tier.PLATINUM) {
        rate = new BigDecimal("0.011");
    } else if (gross.compareTo(new BigDecimal("50000")) > 0) {
        rate = new BigDecimal("0.019");
    } else {
        rate = new BigDecimal("0.024");
    }
    return gross.multiply(rate).setScale(2, RoundingMode.HALF_EVEN);
}
```

(`requireEntries` and `grossBefore` are the corresponding one-job extractions; the
reference-string assembly moved into a `LedgerEntry.settlement` factory next to the data it
formats.)

`settle` now reads as the definition of settling; each helper sits at one level and is
`static` because it needs no instance state. That does **not** prove purity: a static method can
still read ambient state, mutate arguments or perform I/O. Here purity follows from inspecting
the implementation and collaborators, not from the modifier. None of the helpers mutates its
inputs, a property the signature alone cannot promise.

### Trade-offs of extraction

Three new names to trust and three hops for a reader who wants every detail. `feeFor`
smells of Feature Envy toward `Merchant` — deliberately _not_ moved here: relocating
behaviour is a java-refactoring move and widens this change's blast radius. Noted, not done.

This is a structure example, not a complete settlement design. Production code must define
currency/scale, reject invalid amounts, and make ledger posting idempotent or atomic with the
state transition; extracting `ledger.post` does none of that. A retry after an ambiguous post
can duplicate money movement even though the method is beautifully readable.

### Verification of the settlement refactoring

Existing tests unchanged and green. `settle` states its policy in six lines; no helper
requires reading its caller to understand.

## Over-fragmented: a batch processor smeared across fields

### Before: over-fragmented batch state

```java
final class PayoutBatchProcessor {
    private static final BigDecimal DAILY_LIMIT = new BigDecimal("250000");

    private Payout current;
    private BigDecimal runningTotal = BigDecimal.ZERO;
    private final List<Payout> approved = new ArrayList<>();

    public List<Payout> process(List<Payout> payouts) {
        resetState();
        for (Payout payout : payouts) {
            handleOne(payout);
        }
        return finishBatch();
    }

    private void resetState() { runningTotal = BigDecimal.ZERO; approved.clear(); }
    private void handleOne(Payout payout) { current = payout; checkLimit(); }
    private void checkLimit() { if (withinLimit()) accept(); }
    private boolean withinLimit() {
        return runningTotal.add(current.amount()).compareTo(DAILY_LIMIT) <= 0;
    }
    private void accept() { approved.add(current); addToTotal(); }
    private void addToTotal() { runningTotal = runningTotal.add(current.amount()); }
    private List<Payout> finishBatch() { return List.copyOf(approved); }
}
```

### Analysis: local state promoted to fields

Every method is under four lines and none is understandable alone. `current` is a
parameter passed through a field; `runningTotal` and `approved` are locals promoted to
fields so that fragments can share them. That makes the object stateful between internal steps
and non-reentrant. `resetState` permits sequential reuse, but cannot make concurrent calls safe
and leaves stale state after an exception. The reader must reconstruct one 10-line algorithm
from seven call sites.
The method names narrate plumbing ("addToTotal"), not domain.

### After: localised batch state

```java
final class PayoutBatchProcessor {
    private static final BigDecimal DAILY_LIMIT = new BigDecimal("250000");

    public List<Payout> process(List<Payout> payouts) {
        List<Payout> approved = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (Payout payout : payouts) {
            BigDecimal candidate = total.add(payout.amount());
            if (candidate.compareTo(DAILY_LIMIT) <= 0) {
                approved.add(payout);
                total = candidate;
            }
        }
        return List.copyOf(approved);
    }
}
```

One method, twelve lines, one abstraction level ("approve while under the daily limit").
All state is local, so the class became stateless: reusable, thread-safe, and
`resetState` ceased to exist rather than being fixed.

The example assumes one currency, non-null payouts, strictly positive validated amounts and
an order-sensitive "first items that fit" policy. Without those preconditions, negative values
can reopen capacity, nulls fail inside the loop, and input ordering changes the approved set.
Those are domain-contract questions; localising state improves concurrency but does not answer
them.

### Trade-offs of merging fragments

The per-step names are gone. They cost more than they earned — they named mechanics — but
if the limit policy grows real complexity (per-merchant limits, currencies), extract
_then_, with the policy as a parameter-taking function, not fields.

### Verification of the batch refactoring

Same tests green; additionally two `process` calls on one instance now behave identically
— a property the before-version failed without `resetState`.
