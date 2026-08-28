# Chain against pipeline

## The two contracts

|                           | Classical CoR                              | Pipeline / middleware                          |
| ------------------------- | ------------------------------------------ | ---------------------------------------------- |
| How many handlers run     | Until one handles; then stop               | All, unless one short-circuits deliberately    |
| Handler's answer          | "mine" / "not mine"                        | "here is the request, possibly transformed"    |
| Unhandled                 | A real outcome needing a policy            | Cannot happen — the terminal stage is the work |
| Handler controls the rest | No                                         | Yes — it invokes the next, and may wrap it     |
| Typical examples          | Tenant → product → default rule resolution | Servlet filters, interceptors, Netty pipeline  |

```java
// classical: the chain owner iterates; handlers cannot see each other
public Decision decide(Request request) {
    for (Rule rule : rules) {
        var decision = rule.apply(request);          // Optional<Decision>
        if (decision.isPresent()) return decision.get();
    }
    return Decision.defaultFor(request);             // the policy, stated
}

// pipeline: the handler invokes the rest, so it can wrap it
public interface Stage {
    Response handle(Request request, Stage next);    // next.handle(...) inside try/finally
}
```

Choose the linked form only when a stage needs to control the invocation of the rest — timing it,
catching around it, retrying it, running it elsewhere, or skipping it. Otherwise the iterated form
keeps the order visible in one place and removes successor wiring entirely.

## Ordering discipline

Order is the part that decays. Three rules, in increasing strength:

```java
// weakest: numbers, whose meaning lives nowhere
@Order(100) class TenantRule { }
@Order(200) class ProductRule { }

// better: named positions, so the reason is in the code
enum RulePosition { TENANT_OVERRIDE, CONTRACT, PRODUCT, CATALOGUE_DEFAULT }

// best: one explicit list at the composition root
@Bean
List<Rule> rules(TenantRule t, ContractRule c, ProductRule p, DefaultRule d) {
    // most specific first; DefaultRule must stay last — it always matches
    return List.of(t, c, p, d);
}
```

The explicit list has a property the others lack: adding a rule is a change to a file a reviewer
reads, and its position is a deliberate act rather than a number chosen to be bigger than the
last one. When handlers genuinely come from other modules, keep the list but let modules
contribute to named positions, and fail startup on an unknown position.

Two ordering hazards worth testing explicitly:

- **A catch-all that is not last.** A rule matching everything placed second makes rules three
  onward dead code, and nothing fails.
- **Two rules matching the same request.** In a first-match chain the second is unreachable for
  that input. A test asserting which one wins documents the intent.

## Unhandled-request policies

```text
Terminal default handler     always matches; returns the neutral answer.
                             Best when a neutral answer exists.

Explicit exception           NoHandlerFor(request) at the end. Best when
                             silence would be a defect (authorisation,
                             pricing, routing).

Optional/empty result        the caller decides. Honest, and it forces
                             every caller to handle it.

Silent return                never. This is the pattern's classic bug and
                             it fails as "nothing happened", with no log,
                             no metric and no stack trace.
```

Whichever is chosen, count it: a metric on the unhandled path is what turns "a customer says
their discount vanished" into a graph.

## Error propagation and partial state

```java
for (Stage stage : stages) {
    stage.apply(context);        // stage 3 throws — stages 1 and 2 already mutated context
}
```

If stages mutate shared state, a mid-chain failure leaves the request half-processed. Three
defensible designs:

1. **Pure stages over an immutable context.** Each returns a new context; effects are applied once
   at the end, after every stage has succeeded. Best default.
2. **A transaction spanning the chain.** Works when every effect is in one transactional
   resource, and makes the chain's duration the transaction's duration
   (`enterprise-transactions`).
3. **Explicit compensation.** Each stage declares how to undo itself, and the chain unwinds. Real
   cost, only worth it when effects are genuinely external.

What is not defensible is catching and continuing without deciding: a chain that logs and proceeds
turns a failed stage into a silently degraded result.

In message-driven pipelines add one more consideration: with at-least-once delivery, a failure at
stage 3 means stages 1 and 2 run again on redelivery. Either those stages are idempotent, or
their effects must be deferred to the end (`idempotency`, `delivery-semantics`).

## Framework equivalents

| Concern                          | Use                                                          |
| -------------------------------- | ------------------------------------------------------------ |
| HTTP request cross-cutting       | `Filter`, `HandlerInterceptor` — ordered, observable         |
| Authentication and authorisation | The security framework's own filter chain                    |
| Outbound HTTP                    | `ClientHttpRequestInterceptor` / `RestClient` interceptors   |
| Messaging                        | The broker client's interceptor or a Spring Integration flow |
| Netty / reactive transports      | `ChannelPipeline`                                            |

Prefer these for transport-level concerns: they already solve ordering, exception translation,
context propagation and metrics, and a hand-rolled chain beside them means two mechanisms can
apply to the same request with no single place showing the combined order.

Hand-roll when the chain is **domain-shaped** — pricing rules, underwriting checks, approval
policies, document transforms. Frameworks have no concept of those, and pushing them into filters
couples business rules to the transport.

## Validation chains: fail fast or collect

A chain used for validation must decide which it is:

```java
// fail fast — first problem wins; the caller fixes one thing at a time
for (Check check : checks) check.verify(request);      // throws

// collect — every problem reported at once
var issues = checks.stream().flatMap(c -> c.problems(request).stream()).toList();
if (!issues.isEmpty()) throw new ValidationFailed(issues);
```

Collecting is almost always better for anything a human corrects, and fail-fast is right when
later checks are unsafe or expensive after an earlier failure. The mistake is having it be
accidental — determined by whether a handler throws or returns.
