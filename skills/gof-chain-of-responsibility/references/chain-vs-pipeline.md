# Chain against pipeline

## The two contracts

|                           | First-match CoR with owner iteration       | Pipeline / middleware                          |
| ------------------------- | ------------------------------------------ | ---------------------------------------------- |
| How many handlers run     | Until one handles; then stop               | All, unless one short-circuits deliberately    |
| Handler's answer          | "mine" / "not mine"                        | "here is the request, possibly transformed"    |
| Unhandled                 | A real outcome needing a policy            | Terminal/short-circuit outcome must be defined |
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
    Response handle(Request request, Next next);     // next.handle(request) inside try/finally
}

@FunctionalInterface
public interface Next { Response handle(Request request); }
```

These are partial signatures with domain types omitted. The composer supplies the continuation
and terminal handler. Define whether `next` may be called zero or once; repeated invocation is not
a generic retry mechanism. Async forwarding also needs explicit context, cancellation and cleanup
ownership; lexical `finally` can run before asynchronous work completes.
Keep resources alive until downstream use actually ends, on success or failure, and account for
synchronous failure before a stage is returned. A returned future's timeout/cancellation state
alone does not establish termination; retain a separate work-completion/cleanup owner when needed
(`cancellation-and-interruption`). Never retain a framework continuation beyond its supported lifetime.

Choose the linked form only when a stage needs to control the invocation of the rest — timing it,
catching around it, retrying it, running it elsewhere, or skipping it. Otherwise the iterated form
keeps the order visible in one place and removes successor wiring entirely.

## Ordering discipline

Order is the part that decays. Choose a representation that makes the rationale reviewable:

```java
// insufficient if the numeric precedence has no documented contract
@Order(100) class TenantRule { }
@Order(200) class ProductRule { }

// named positions put the reason in the code; ties still need a policy
enum RulePosition { TENANT_OVERRIDE, CONTRACT, PRODUCT, CATALOGUE_DEFAULT }

// explicit list: useful when this composition root owns the membership
@Bean
List<Rule> rules(TenantRule t, ContractRule c, ProductRule p, DefaultRule d) {
    // most specific first; DefaultRule must stay last — it always matches
    return List.of(t, c, p, d);
}
```

An explicit list centralizes review of membership and precedence. For contributed handlers,
documented framework ordering may already suffice; do not add a second list solely to replace
numbers. If using named slots, validate contributed positions at assembly time.
Also resolve ties deterministically or reject them, validate duplicates/required stages, and freeze
the assembled membership before sharing it. Named positions alone do not define ordering within a slot.

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

Optional/empty result        the caller decides; explicit in the API,
                             but tests must verify callers do not ignore it.

Silent return                never. This is the pattern's classic bug and
                             it fails as "nothing happened", with no log,
                             no metric and no stack trace.
```

For operationally significant fallthrough, a bounded metric can make an unexpected change visible;
an expected no-advice result in a small local API need not introduce telemetry infrastructure.

## Error propagation and partial state

```java
for (Stage stage : stages) {
    stage.apply(context);        // stage 3 throws — stages 1 and 2 already mutated context
}
```

If stages mutate shared state, a mid-chain failure leaves the request half-processed. Three
defensible designs:

1. **Pure stages over an immutable context.** Each returns a new context; effects are applied once
   at the end per attempt, after every stage has succeeded. The final effect boundary still
   needs atomicity/idempotency/recovery; immutable context alone supplies none of these.
2. **A transaction spanning the chain.** Covers effects actually enlisted in its atomic unit:
   often one database, or supported coordinated resources. Unenlisted calls remain outside it;
   keep transaction duration and isolation appropriate to the work
   (`enterprise-transactions`).
3. **Explicit compensation.** When effects cannot share the required transaction, define semantic
   repair and a recovery owner for known or uncertain outcomes. Compensation can fail or conflict
   with later changes; it is not automatic reverse-order rollback or necessarily possible for
   irreversible effects (`distributed-transactions-and-sagas`).

What is not defensible is catching and continuing without deciding: a chain that logs and proceeds
turns a failed stage into a silently degraded result.

In message-driven pipelines add one more consideration: with at-least-once delivery, a failure at
stage 3 can cause stages 1 and 2 to run again under the actual redelivery policy. Either those stages are idempotent, or
their final commit must be idempotent/transactional and coordinated with acknowledgement.
Deferring effects does not prevent duplicate execution after commit-before-ack failure
(`idempotency`, `delivery-semantics`).

## Framework equivalents

| Concern                          | Use                                                          |
| -------------------------------- | ------------------------------------------------------------ |
| HTTP request cross-cutting       | `Filter`, `HandlerInterceptor` — ordered, observable         |
| Authentication and authorisation | The security framework's own filter chain                    |
| Outbound HTTP                    | `ClientHttpRequestInterceptor` / `RestClient` interceptors   |
| Messaging                        | The broker client's interceptor or a Spring Integration flow |
| Netty / reactive transports      | `ChannelPipeline`                                            |

Prefer these for transport-level concerns, then verify the actual framework's ordering, error,
async-dispatch and context/metrics behavior. None of those guarantees follows from the word chain.
A hand-rolled chain beside them means two mechanisms can
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
