# Worked examples: splitting and merging

Both directions of the same judgement. The first method is too big because it mixes
abstraction levels; the second class is too small in every piece because state that should
be local was smeared across fields. Neither "long" nor "short" was the problem.

These are partial snippets with omitted domain types, collaborators and imports, not
standalone programs. Batch snippets need Java 10+ for `List.copyOf`; import the used
`java.util` and `java.math` types. Verification sections specify checks for a concrete
implementation, not test results obtained from these sketches.

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
_mechanics_ (loop bookkeeping, rounding mode, reference-string assembly). Describing it as
"sums captured entries **and** picks a fee rate **and** rounds **and** formats a ledger
reference **and** posts" suggests places to inspect, not proof that each step needs a
helper. Here the policy — the part a maintainer will be sent here to change — is buried
between mechanics.

### After: cohesive settlement flow

This sketch assumes stable settlement data and iteration, with side-effect-free, nonthrowing
accessors on valid inputs. The `grossBefore` call reads `cutoff()` once, before evaluating its
`entries()` argument and entering the loop; the original reads it after `capturedAt()` on every
iteration. If those observations can change
or fail, retain their original placement inside the helper instead of silently introducing a
snapshot. Java evaluates method arguments before entering the helper, from left to right
([JLS 25 §15.7.4](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.7.4)).

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

Three new names to trust and three hops for a reader who wants every detail. Moving
`feeFor` toward `Merchant` needs evidence about who owns the fee policy and how it changes;
reading merchant data alone is not a defect. If warranted, relocating behaviour is a
java-refactoring move and widens this change's scope.

This is a structure example, not a complete settlement design. Production code must define
currency/scale and reject invalid amounts. If the operation may be replayed, establish what
prevents repeat posting: an atomic conditional transition that permits the effect only once
may suffice, or the operation needs another enforced idempotency contract (see `idempotency`).
Merely committing a post and an unconditional state write together does not deduplicate a
retry. Extracting `ledger.post` adds none of these guarantees; an ambiguous result still
requires recovery under the actual participant contract.

### Verification of the settlement refactoring

Run existing tests unchanged and compare both versions at the capture cutoff (equal
timestamps remain included), the exact 50000 fee threshold, platinum precedence and
half-even rounding ties. Verify the empty-input exception and ledger entry/effect count,
including post failure; extraction must not reorder effects or change retry behaviour.
Confirm the stable-data assumption before consolidating reads. For accessors that can change or
throw, compare observation order, count and first failure; identical totals on fixed fixtures do
not validate a snapshot replacement.

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
Scratch state is local, so independent calls no longer share the accumulator, and
`resetState` ceased to exist rather than being fixed. Concurrent safety still requires
stable input iteration and safe `Payout` access; a caller concurrently mutating the list
or its elements can invalidate that claim. `List.copyOf` does not deep-copy the payouts.

Despite the constant's name, both versions enforce a limit per invocation. Neither tracks
a shared daily budget across batches; adding that policy would be a separate semantic
change requiring coordinated state and a defined day/time zone.

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

Compare both versions for empty input, exact limit, an oversized item followed by one
that fits, and order-sensitive acceptance. Sequential reuse already works in the original
because it calls `resetState`; do not claim otherwise. Check overlapping calls with
independent stable inputs against serial expected results to expose shared accumulator
interference, and verify returned-list structure cannot be mutated. A passing concurrency
test covers its interleavings, not every possible schedule.
