# Worked example: authorisation rules for a payment

A payment is approved, referred for review, or declined. The rule that applies is the most
specific one that matches: a tenant override, then a contract rule, then a product rule, then the
catalogue default. New tenants and products arrive continuously, contributed by a configuration
module.
This is an illustrative routing/approval policy, not a payment-security recommendation. It assumes
tenant decisions are authorized overrides. Mandatory fraud, compliance or authorization checks must
run outside this first-match selection or otherwise be guaranteed before any approval. Examples are
partial Java 17; Spring/JUnit/property-test fragments require project dependencies, not new upgrades.

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

As independently contributed rules grow, they require edits to this shared method. The order of
specificity is already visible in its `if`s; a chain is justified by the composition need, not by
the presence of branching alone.

## After — first-match chain

```java
public interface AuthorisationRule {
    String name(); // stable bounded rule kind, not tenant/payment identifiers
    /** Non-null: empty abstains; any present decision, including decline, ends selection.
     *  Exceptions fail the attempt; they are not abstention. */
    Optional<Decision> apply(Payment payment);
}
```

```java
public final class AuthorisationRules {

    private final List<AuthorisationRule> rules;      // order is the design

    public AuthorisationRules(List<AuthorisationRule> rules) {
        this.rules = List.copyOf(rules);             // rejects null list/elements; freezes membership
    }

    public Decision decide(Payment payment) {
        java.util.Objects.requireNonNull(payment);
        for (AuthorisationRule rule : rules) {
            var decision = rule.apply(payment);
            if (decision.isPresent()) {
                return decision.get();
            }
        }
        throw new NoAuthorisationRule(payment.id(), payment.productCode());
    }
}
```

Three decisions worth naming:

- **`Optional<Decision>`, not a boolean plus a getter.** "Do you handle this?" followed by "then
  handle it" is two calls that can disagree; one call that either answers or does not cannot.
- **The unhandled case throws.** A payment with no applicable rule must not be silently approved,
  and must not silently vanish. Instrument the owner at the application boundary with bounded
  rule-kind/unhandled metrics; telemetry failures must not turn a chosen approval into a retry.
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

Suppose a change makes `CatalogueDefaultRule` return empty for products not in the catalogue — reasonable
in isolation, but it turns the chain's terminal guarantee into a runtime exception for a small
set of payments. Two signals would help identify this hypothetical failure:

- The `authorisation.unhandled` counter rises above its expected rate.
- `NoAuthorisationRule` carries the product code to identify affected inputs in appropriate diagnostics.

Resolve the domain policy before repairing the default. Unknown products may require rejection
or referral; restoring blanket approval merely to restore totality is not a valid fix. For the
accepted total-default policy, assert the outcome as well as presence for relevant input classes:

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
public record Decision(Outcome outcome, String reason, List<DomainEvent> events) {
    public Decision { events = List.copyOf(events); }
}

// Application boundary, pseudocode: persist decision + event intents atomically under
// the operation key, then acknowledge. Relay intents and deduplicate downstream effects.
```

Rules describe effects for the winning decision; copying the event list freezes membership, not
mutable event payloads. A simple `events.forEach(publish)` could publish a prefix and fail or publish
again on redelivery. Where state and messaging must agree, use an appropriate transactional outbox
and idempotent consumers; test commit-before-ack and relay retry. See
[Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html).

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

Order and fallthrough also matter in branching code; a chain moves them into composition and
therefore needs tests there. Add handler-exception, no-invocation-after-match and mandatory-check
bypass cases, plus replay/partial-commit tests when effects exist.

## Why not a switch

The alternative considered was a sealed `RuleKind` with an exhaustive `switch`. It was rejected
because the rule set is genuinely open — the configuration module contributes tenant rules at
runtime. Changing data alone does not prove open behavior: a fixed algorithm can read configurable
tables. For four fixed kinds, an ordered `if` sequence or loop may already be adequate.
An exhaustive `switch` helps only when its discriminator expresses the decision without losing
overlapping-rule priority; a sealed type alone does not supply that priority
(`java-composition-over-inheritance`).
