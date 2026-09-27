# Chain against pipeline

## The two contracts

|                           | First-match CoR with owner iteration       | Pipeline / middleware                           |
| ------------------------- | ------------------------------------------ | ----------------------------------------------- |
| How many handlers run     | Until one handles; then stop               | Eligible stages until short-circuit or failure  |
| Handler's answer          | "mine" / "not mine"                        | "here is the request, possibly transformed"     |
| Unhandled                 | A real outcome needing a policy            | Terminal/short-circuit outcome must be defined  |
| Handler controls the rest | No                                         | Depends: continuation or owner-driven callbacks |
| Typical examples          | Tenant → product → default rule resolution | Servlet filters, interceptors, Netty pipeline   |

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

## Continuation and completion are contracts

For synchronous middleware assembled as `A(B(terminal))`, ordinary entry runs A then B,
and return unwinds B then A. Code after `next` runs only if it returns normally; a `finally`
also runs on an exception through that call. Neither is proof of asynchronous completion.
State whether each invocation may forward zero or once, what a zero-forwarding stage returns
or writes, and who owns resources on each path. An early response needs to end that branch;
falling through to `next` can invoke a handler after rejection or write a second response.

Use a recording terminal and resource close counter to distinguish these synchronous paths:

```text
A forwards, B forwards: A.enter, B.enter, terminal, B.cleanup, A.cleanup; terminal once
A forwards, B returns:  A.enter, B.enter, B.cleanup, A.cleanup; terminal never
terminal throws:       A.enter, B.enter, terminal, B.cleanup, A.cleanup; failure propagates
```

Here each stage acquired a resource and uses `finally`; these traces are a proposed local
contract, not every framework's callback schedule. Test throwing before forwarding too.
Cleanup must not accidentally replace the chosen result or primary exception: a return or
throw from `finally` can do so. Use the project's resource/exception convention; lexical
`AutoCloseable` ownership can use try-with-resources, while asynchronous use needs a completion
owner. Do not share a mutable continuation cursor across requests or retain a continuation
past its supported invocation lifetime.

## Ordering discipline

Order is the part that decays. Choose a representation that makes the rationale reviewable:

```java
// insufficient if the numeric precedence has no documented contract
@Order(100) class TenantRule { }
@Order(200) class ProductRule { }

// named positions put the reason in the code; ties still need a policy
enum RulePosition { TENANT_OVERRIDE, CONTRACT, PRODUCT, CATALOGUE_DEFAULT }

// explicit owner construction: RuleChain copies the ordered list, as in the worked example
@Bean
RuleChain ruleChain(TenantRule t, ContractRule c, ProductRule p, DefaultRule d) {
    // most specific first; DefaultRule must stay last — it always matches
    return new RuleChain(List.of(t, c, p, d));
}
```

An explicit list passed to the chain owner centralizes review of membership and precedence.
In Spring, an injected `List<Rule>` can collect the individual `Rule` beans instead of using a
separately declared list bean. Name/qualifier matching and framework version affect resolution;
do not assume declaring `@Bean List<Rule>` controls every collection injection. Construct the
owner directly as above, or deliberately configure collection injection and test the actual
consumer in its application context. `RuleChain` here is the domain owner, not a Spring API.

For contributed handlers,
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

In Spring 6.2, `HandlerInterceptor` uses callbacks rather than a handler-owned `next`.
Its `afterCompletion` applies only when that interceptor's `preHandle` completed with `true`.
A stage that acquires a resource then returns `false` or throws needs its own cleanup for
that path. `postHandle` is a success hook, not unconditional cleanup. Async handling can
release the request thread without either completion callback; redispatch can invoke the
interceptors again, and timeout/network-error paths need the documented async callbacks.
Distinguish thread-context cleanup from releasing a resource still used by asynchronous work.
Use the security framework for mandatory security coverage, not MVC interceptor path matching.

Netty 4.1 routes inbound and outbound events in opposite directions and skips handlers that
do not implement the relevant event direction. Inspect the event and forwarding method before
diagnosing an absent handler as a broken order. These are versioned examples: check the
project's actual APIs and mappings instead of imposing either framework's lifecycle elsewhere.

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

Collect independent, side-effect-free violations when one response helps a caller correct the
input. Gate dependent checks on their prerequisites: a malformed identifier must not trigger
an account lookup, and a failed size limit must not lead to expensive decoding merely to collect
more errors. Bound work and error output for untrusted bulk input. Treat an unavailable dependency
as an execution failure, not a fabricated validation violation. A phased validator can fail fast
on structural prerequisites and collect independent field violations afterward; choose from the
contract rather than whether a handler happens to throw or return.

## Decision cases

These are teaching walkthroughs, not measured agent evaluations:

- **First-match denial:** two rules match a document route; the earlier one returns an explicit
  rejection. Preserve that result and prove the later allow rule is not invoked. Treating rejection
  or a handler exception as abstention fails the contract.
- **Cleanup pair:** a synchronous Spring 6.2 interceptor acquires a request-scoped resource.
  A returns `true`; its successful registration permits cleanup in `afterCompletion`. B instead
  returns `false`; clean up B's resource on that branch because B's `afterCompletion` will not run.
  Acquisition/`preHandle` failure also needs cleanup. Changing only the return outcome changes
  the required path; demanding a new custom chain for either is unnecessary.
- **Async lifetime:** a stage returns a future while downstream still reads its buffer. Keep the
  buffer valid through actual use, including cancellation races; releasing it when `next` returns
  or assuming future cancellation stopped work is a failure.
- **Unknown wiring:** plugins match the same input, but no effective registration or tie policy
  is supplied. Inspect configuration and caller tests; ask only for unresolved precedence policy.
  Inventing priority from source-file order or an unused list factory is a failure.
- **Simple baseline:** three stable overlapping predicates already have tested priority and no
  contribution requirement. Retain the conditionals or ordered loop. Handler count alone cannot
  justify classes, dependencies or an incompatible pattern switch on Java 17.
- **Dependent validation:** a form has independent field checks plus a remote lookup requiring
  a valid identifier. Collect the independent issues but skip the lookup if that prerequisite
  fails. Running every check indiscriminately or reporting an outage as invalid input is a failure.
- **Service boundary:** a request is already handled by several separately deployed services.
  Pass effect/acknowledgement order, uncertain outcomes and recovery requirements to
  `distributed-transactions-and-sagas`; if unavailable, report those unresolved contracts and
  propose the next diagnostic step. A local successor interface supplies no distributed rollback.

## Sources

- [Spring 6.2 collection injection and ordering](https://docs.spring.io/spring-framework/reference/6.2/core/beans/annotation-config/autowired.html).
- [Spring 6.2.12 dependency resolution](https://github.com/spring-projects/spring-framework/blob/v6.2.12/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java): name/qualifier shortcuts and collection-element resolution precede the direct collection-bean fallback.
- [Java 17 try/finally semantics](https://docs.oracle.com/javase/specs/jls/se17/html/jls-14.html#jls-14.20.2): abrupt cleanup can replace the pending return or exception.
- [Spring 6.2.12 HandlerInterceptor](https://docs.spring.io/spring-framework/docs/6.2.12/javadoc-api/org/springframework/web/servlet/HandlerInterceptor.html): callback eligibility, reverse completion order and security-mapping limits.
- [Spring 6.2.12 AsyncHandlerInterceptor](https://docs.spring.io/spring-framework/docs/6.2.12/javadoc-api/org/springframework/web/servlet/AsyncHandlerInterceptor.html): thread exit, redispatch and completion paths without redispatch.
- [Netty 4.1 ChannelPipeline](https://netty.io/4.1/api/io/netty/channel/ChannelPipeline.html): event direction and eligible handler traversal.
