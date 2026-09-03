# The safety workflow, with a worked characterisation example

## Characterisation tests

A characterisation test pins what the code _does_, not what it should do. It is
scaffolding: written quickly and reviewed, with assertion values captured from observed
behaviour. Replace it with intent-revealing tests once intent is known; retain rows that protect
valuable regressions instead of deleting them by ritual.

Method: pick inputs that force every branch (read the conditionals and choose values on
both sides of each boundary); run the code; paste the observed outputs into assertions.
When an observed output looks wrong, capture it and escalate the behavior decision rather than
silently fixing it while moving code. A security, corruption or compliance defect may require
an immediate separate fix and must not be knowingly preserved into release merely because a
caller could depend on it.

Coverage target: branches, meaningful combinations, failure and side-effect paths, and
comparison boundaries (`> 20` means values at and just above the boundary, using the domain's
exact numeric representation). Branch coverage alone does not establish behavioral equivalence.

## Worked example: a shipping-cost method with no tests

### Before

```java
public int costCents(Order order) {
    int cost = 0;
    if (order.weightKg() > 20) {
        cost = 1500 + (int) (order.weightKg() * 55);
    } else {
        cost = 900;
    }
    if (order.destination().equals("BR-N") || order.destination().equals("BR-NE")) {
        cost += cost / 4;
    }
    if (order.express()) {
        cost = cost * 2;
        if (order.weightKg() > 20) {
            cost += 500;
        }
    }
    if (order.totalCents() > 30000 && !order.express()) {
        cost = 0;
    }
    return cost;
}
```

### Analysis

Four interacting conditionals, order-dependent (the free-shipping check runs last and is
defeated by `express`). Branch boundaries to force: weight at 20 and 20.1; each
destination class; express on/off; total at 30000 and 30001; and the interactions
express×heavy and express×free-shipping.

### The characterisation test

Outputs below were produced by running the method, not by reasoning about it — that is
the point.

```java
@ParameterizedTest
@CsvSource({
    "10.0, BR-SE, false, 12000,  900",
    "20.0, BR-SE, false, 12000,  900",   // 20 is not 'heavy': strict >
    "20.1, BR-SE, false, 12000, 2605",
    "35.0, BR-N,  false, 12000, 4281",
    "35.0, BR-N,  true,  12000, 9062",   // surcharge doubles under express
    "10.0, BR-NE, true,  50000, 2250",   // express DEFEATS free shipping — bug? pinned, filed as SHIP-311
    "35.0, BR-N,  false, 50000,    0",
    "10.0, BR-S,  false, 30001,    0",
})
void pinsCurrentBehaviour(double kg, String dest, boolean express, int total, int expected) {
    assertEquals(expected, calculator.costCents(new Order(kg, dest, express, total)));
}
```

The sixth row looks like a defect (a big order pays because it is express). It is pinned
and ticketed, not fixed: if product confirms it is a bug, the fix is its own commit with
its own test _after_ the refactoring.

### The steps

Each line was one commit, tests green after each:

1. Extract `freeShippingApplies(order)` and convert it to a leading guard clause —
   legal only because the pinned table proves no path both zeroes and then modifies.
2. Extract `baseCost(weightKg)`; introduce the `HEAVY_KG` constant, replacing both
   `> 20` occurrences.
3. Extract `remoteSurcharge(cost, destination)`.
4. Extract `expressCost(cost, order)` containing the doubling and heavy top-up.

### After

```java
public int costCents(Order order) {
    if (freeShippingApplies(order)) {
        return 0;
    }
    int cost = baseCost(order.weightKg());
    cost += remoteSurcharge(cost, order.destination());
    cost = expressCost(cost, order);
    return cost;
}
```

### Trade-offs

The pinned suite asserts magic numbers and one probable bug — it documents the present,
not the intent, so it must not survive as the permanent suite. Step 1 changed evaluation
order (guard first instead of last), which is exactly the kind of step that is safe
_only_ because the interaction rows exist; with a thinner table it would have been an
unverified behaviour change.

### Verification

All eight rows green before and after every step; a deliberate mutation of the guard
(`>= 30000`) fails row 8, proving the boundary is actually covered. After the
refactoring, the characterisation rows were rewritten as named intent tests
(`freeShippingRequiresNonExpress`, …) and SHIP-311 proceeded separately.

## Pinning a dimension that is not the return value

The method above pins a value. Several of the dimensions in `behaviour-preservation.md`
need a different seam, and the catalogue steps that touch them most — Split Loop, Slide
Statements, Move Method — are exactly the ones a returned-value assertion cannot see.

- **Call count and order** — a recording double (Mockito `InOrder`, or a collaborator that
  appends to a `List<String>`) asserted as one expected sequence. Assert the whole list: a
  `verify` per call cannot see an extra call you did not think to forbid.
- **Events emitted** — `@RecordApplicationEvents` and `ApplicationEvents`, or the outbox
  rows. Assert count, order and payload; they are three separate dimensions.
- **SQL emitted** — Hibernate `Statistics` for counts, a statement-capturing proxy
  (`datasource-proxy`, `p6spy`) for the text, asserted as an ordered list. Statement
  _count_ catches the fetch-strategy change that no returned value reveals.
- **Iteration order** — an order-sensitive matcher (`containsExactly`), never
  `containsExactlyInAnyOrder`, or the assertion itself unpins the dimension.

Pin only the dimensions the step can touch. A full recording of every collaborator call is
a change detector, and it will be deleted by the first person it annoys.

## When characterisation is not worth it

- The code is about to be deleted or wholesale-replaced with an approved behaviour
  change — characterise nothing; write acceptance tests for the _new_ behaviour.
- The behaviour is dominated by I/O and wall-clock effects: pin at a coarser seam
  (record/replay at the port) instead of unit-level pinning.
- Output is intentionally unstable (timestamps, ids): pin the stable projection of the
  output, never `toString` of the whole object.
- A golden-master (snapshot of full output for many inputs) beats hand-written rows
  when the output is large and structured — but review the master once, or it pins
  garbage with authority.
