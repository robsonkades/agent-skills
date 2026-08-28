# Worked example: authorisation rules for a payment

A payment is approved, referred for review, or declined. The rule that applies is the most
specific one that matches: a tenant override, then a contract rule, then a product rule, then the
catalogue default. New tenants and products arrive continuously, contributed by a configuration
module.

## Before

```java
public Decision decide(Payment payment) {
    if (tenantOverrides.containsKey(payment.tenantId())) {
        var override = tenantOverrides.get(payment.tenantId());
        if (override.appliesTo(payment)) return override.decision();
    }
    if (payment.contractId() != null) {
        var contract = contracts.find(payment.contractId());
        if (contract != null && contract.hasLimit()
                && payment.amount().isGreaterThan(contract.limit())) {
            return Decision.refer("over contract limit");
        }
    }
    var product = products.find(payment.productCode());
    if (product != null && product.requiresReview(payment.amount())) {
        return Decision.refer("product threshold");
    }
    if (payment.amount().isGreaterThan(catalogueDefaultLimit)) {
        return Decision.refer("default limit");
    }
    return Decision.approve();
}
```

Sixty lines by the time every product's exception is in it, four levels of nesting, and every new
rule is an edit in the middle of a method three teams touch. The order of specificity — the actual
design — is expressed only by the order of the `if`s.

## After — first-match chain

```java
public interface AuthorisationRule {
    /** Empty when this rule has no opinion about this payment. */
    Optional<Decision> apply(Payment payment);
}
```

```java
public final class AuthorisationRules {

    private final List<AuthorisationRule> rules;      // order is the design

    public Decision decide(Payment payment) {
        for (AuthorisationRule rule : rules) {
            var decision = rule.apply(payment);
            if (decision.isPresent()) {
                metrics.counter("authorisation.decided", "rule", rule.name()).increment();
                return decision.get();
            }
        }
        metrics.counter("authorisation.unhandled").increment();
        throw new NoAuthorisationRule(payment.id(), payment.productCode());
    }
}
```

Three decisions worth naming:

- **`Optional<Decision>`, not a boolean plus a getter.** "Do you handle this?" followed by "then
  handle it" is two calls that can disagree; one call that either answers or does not cannot.
- **The unhandled case throws.** A payment with no applicable rule must not be silently approved,
  and must not silently vanish. The counter beside it makes the condition visible before a
  customer reports it.
- **Rules do not know each other.** No successor field, no `setNext`. The owner iterates, so the
  order lives in one readable place.

## The order, made explicit

```java
@Bean
List<AuthorisationRule> authorisationRules(TenantOverrideRule tenant,
                                           ContractLimitRule contract,
                                           ProductThresholdRule product,
                                           CatalogueDefaultRule catalogue) {
    // Most specific first. CatalogueDefaultRule matches every payment and
    // MUST stay last; anything after it is unreachable.
    return List.of(tenant, contract, product, catalogue);
}
```

```java
@Test
void the_catch_all_rule_is_last() {
    assertThat(rules.get(rules.size() - 1)).isInstanceOf(CatalogueDefaultRule.class);
}
```

That test looks trivial and it is the one that fires when someone appends a new rule to the end of
the list, six months from now, and quietly makes it dead code.

## Then the default rule stopped matching everything

A change made `CatalogueDefaultRule` return empty for products not in the catalogue — reasonable
in isolation, and it turned the chain's terminal guarantee into a runtime exception for a small
set of payments. Two things made this a five-minute diagnosis rather than an incident:

- The `authorisation.unhandled` counter had a rate above zero.
- `NoAuthorisationRule` carried the product code, so the affected set was obvious from the
  exception.

The fix restored the invariant in the rule itself, and a test asserted it directly:

```java
@Property
void the_default_rule_has_an_opinion_about_every_payment(@ForAll("payments") Payment p) {
    assertThat(new CatalogueDefaultRule(limits).apply(p)).isPresent();
}
```

## When a rule acquired a side effect

A later rule needed to record that a manual review had been requested. Written naively it would
have written to the database from inside `apply`, which breaks the chain in two ways: a rule that
runs but does not win still leaves its effect behind, and re-running the decision — which the
retry on the enclosing message consumer does — would record it twice.

The fix keeps rules pure and moves the effect out:

```java
public record Decision(Outcome outcome, String reason, List<DomainEvent> events) { }

// the chain owner, after a decision is chosen
decision.events().forEach(events::publish);
```

Rules now describe what should happen; the owner applies it, once, for the winning rule only.
This is the general answer to partial state in a chain: make the stages pure over a value and
apply effects at the end (`event-driven-architecture`).

## The three tests

```java
// 1. each rule alone
@Test void contract_rule_refers_when_over_the_contract_limit() { ... }
@Test void contract_rule_abstains_when_the_payment_has_no_contract() { ... }

// 2. the order
@Test void a_tenant_override_wins_over_a_contract_limit() {
    var payment = payment().withTenant(OVERRIDDEN).overContractLimit().build();
    assertThat(rules.decide(payment)).isEqualTo(Decision.approve());
}

// 3. the unhandled case
@Test void an_unknown_product_fails_loudly_rather_than_being_approved() {
    assertThatThrownBy(() -> rulesWithoutDefault.decide(paymentFor("UNKNOWN")))
            .isInstanceOf(NoAuthorisationRule.class);
}
```

The second and third are the ones a chain needs and a branching method did not: order and
fallthrough are properties of the composition, invisible in any single rule.

## Why not a switch

The alternative considered was a sealed `RuleKind` with an exhaustive `switch`. It was rejected
because the rule set is genuinely open — the configuration module contributes tenant rules at
runtime, and products are data. Had the set been the four kinds above and nothing more, the
`switch` would have been the better answer: shorter, exhaustive at compile time, and with the
order visible without a wiring file (`java-composition-over-inheritance`).
