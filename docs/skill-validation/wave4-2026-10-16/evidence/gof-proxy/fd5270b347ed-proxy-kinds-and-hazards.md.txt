# Proxy kinds, mechanics and hazards

## The four kinds

| Kind                | Controls                     | Typical use                                      | Principal hazard                                          |
| ------------------- | ---------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| **Virtual**         | When the subject is created  | Expensive resources; JPA lazy associations       | Publication races; work triggered from an innocent getter |
| **Remote**          | Where the subject lives      | RPC stubs, service clients                       | Latency and partial failure presented as local behaviour  |
| **Protection**      | Who may call                 | Authorisation wrappers                           | Protected callers can bypass through unchecked access     |
| **Smart reference** | Bookkeeping around each call | Caching, counting, logging, `synchronized` views | Becomes a decorator in disguise; hidden cost per call     |

## Proxy against Decorator

| Question                                               | Proxy                         | Decorator                     |
| ------------------------------------------------------ | ----------------------------- | ----------------------------- |
| Does the caller have another way to reach the subject? | Usually no                    | Usually yes                   |
| Are several of them stacked, in a chosen order?        | Rarely                        | Yes, and order matters        |
| Who decides it exists?                                 | The subject's owner/framework | Whoever wires the object      |
| Does it manage the subject's lifecycle?                | May create/own it             | Ownership depends on contract |

Both implement the subject's interface, which is why the distinction is behavioural rather than
structural. Stacked protection/lazy/remote proxies retain their access roles while also requiring
the composition analysis in `gof-decorator`.

## JDK dynamic proxies against bytecode subclassing

```java
// JDK: interfaces only
Foo foo = (Foo) Proxy.newProxyInstance(loader, new Class<?>[]{ Foo.class },
        (p, method, args) -> {
            if (method.getDeclaringClass() == Object.class) {
                return switch (method.getName()) {
                    case "equals" -> p == args[0];
                    case "hashCode" -> System.identityHashCode(p);
                    case "toString" -> "Foo proxy";
                    default -> throw new AssertionError(method);
                };
            }
            try { return method.invoke(target, args); }
            catch (java.lang.reflect.InvocationTargetException e) { throw e.getCause(); }
        });

// CGLIB / ByteBuddy: generates a subclass, so it can proxy classes
```

The handler deliberately uses proxy identity for equality and hashing; it is not a universal
entity-equality policy. Blindly forwarding `equals` to an identity-based target can make
`proxy.equals(proxy)` false. Preserve the consumer's equality/hash and registration contract.

Unwrapping `InvocationTargetException` preserves the target cause, but a checked exception still
must fit the interface's `throws` contract or the proxy throws `UndeclaredThrowableException`.
For duplicate method signatures across interfaces, it must fit all applicable declarations.
A returned `CompletionStage` can fail after `invoke` returns: observe the stage when the policy
concerns completion, and preserve its failure/cancellation contract. Invocation return alone does
not justify releasing resources still used by that work.

**Fluent returns need their own receiver check.** With the simple forwarding handler above,
`proxy.configure(options).execute()` can run `configure` through the handler but `execute`
directly on the target if `configure` returns `this`. The JDK returns the handler's result; it
does not automatically replace target references with the proxy. Inspect consumer chains and
callback/nested-object aliases when interception is required.

For a method whose contract returns the same guarded receiver, a handler may replace a result
identical to the target with the proxy when the declared return type accepts it. Do not replace
a distinct newly created object or assume a proxy fits a concrete target return type. If the API
cannot preserve the required boundary, prefer an explicit non-chaining operation or redesign the
return contract compatibly. Test the second call's advice, not only the first call's return type.

Framework behavior can differ: [Spring 6.2.11's JDK proxy implementation](https://github.com/spring-projects/spring-framework/blob/v6.2.11/spring-aop/src/main/java/org/springframework/aop/framework/JdkDynamicAopProxy.java)
substitutes the proxy for some compatible direct self-returns, with exceptions, and cannot repair
a target reference embedded in another returned object. This is implementation evidence for that
version; verify the actual framework and return contract rather than generalizing it to all proxies.

| Mechanism         | Requires                                    | Cannot intercept                                                          |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| JDK dynamic proxy | Eligible interfaces                         | Target-only methods; Object.equals/hashCode/toString do reach the handler |
| Subclass (CGLIB)  | A non-final class with a usable constructor | `final` classes, `final` methods, `private` methods, `static` methods     |

Consequences that bite in practice:

- Java 17 JDK proxies require non-hidden, non-sealed interfaces visible to the selected loader;
  a sealed interface directly in the proxy-interface array is rejected. Check package/module and
  method-signature restrictions before changing a public interface or proxy mechanism.
- Making a service class `final` — a reasonable default otherwise — disables Spring's
  subclass-based proxying for it.
- A private method is not intercepted by ordinary proxy-based Spring advice; weaving differs.
- With JDK proxies, injecting the concrete class rather than the interface fails at startup,
  which is at least loud.

## Self-invocation: the silent hole

```java
@Service
public class OrderService {

    public void importAll(List<Row> rows) {
        for (Row row : rows) {
            save(row);                 // this.save(...) — the proxy is NOT involved
        }
    }

    @Transactional
    public void save(Row row) { ... }  // no new transaction advice here; an outer transaction may exist
}
```

The annotation works by the caller holding the proxy. An internal call goes straight to the
target, so that method's proxy advice does not run. Existing transaction/context may still apply;
this example assumes proxy mode, not AspectJ weaving.

First establish the required unit of work and which advice is missing. An effective outer
transaction may already satisfy the contract; self-invocation alone does not require a refactor.
When a boundary is missing, compare these options without changing batch atomicity or propagation
by accident:

1. **Move the annotated method to another bean** when it is a useful responsibility boundary.
   The call then crosses the proxy; verify that its actual advice gives the intended transaction.
2. **Use an explicit programmatic transaction boundary** when transaction scope is the problem
   and it fits the existing design, for example Spring's `TransactionTemplate` for imperative work.
3. **Inject a proxy reference to self when supported by the configuration.** Use an interface
   compatible with proxy kind; verify circular-reference and initialization behavior.
4. **`AopContext.currentProxy()`.** Requires `exposeProxy = true` and couples the code to Spring
   AOP. Last resort.

Detection: for methods whose configured advice is required, trace the actual receiver. Both
implicit and explicit `this` calls, and calls through aliases of the raw target, bypass the proxy.
A self-injected reference must actually point to the proxy to cross that boundary. An architecture
test can flag candidate paths (`architecture-testing`); verify wiring, advice mode and the required
unit of work before treating a syntactic match as a defect or a refactoring as a fix.

## JPA lazy proxies

Hibernate 6.6 can use proxies or bytecode enhancement; inspect mapping and runtime settings.
For an uninitialized polymorphic proxy, these operations need particular care:

```java
Customer c = order.getCustomer();          // may be a Customer-compatible proxy
c.getClass();                              // may report generated proxy class
boolean premium = c instanceof PremiumCustomer; // may be false before underlying subtype is resolved
c.equals(realCustomer);                    // depends on the entity equality contract
Hibernate.unproxy(c);                       // may initialize; uninitialized detached proxy can fail
```

- **Concrete subtype checks can fail.** Inheritance hierarchies plus lazy loading can produce
  different behavior between a freshly persisted object and one loaded
  from the database (`inheritance-mapping-strategies`).
- **Equality needs an explicit entity contract.** Stable natural keys or carefully handled generated
  identifiers can work. Test transient/persisted/detached/proxied objects, symmetry and hash stability;
  id-based equality alone is not sufficient (`orm-structural-mapping`).
- **`LazyInitializationException`** can occur when unfetched state has no usable loading session.
  Decide required fetch and lifecycle boundaries; already initialized values need no load. Compare
  fetch joins, graphs or projections before widening session lifetime (`orm-behavioral-patterns`,
  `query-objects-and-specifications`).
- **A lazy dereference in a loop may produce N+1.** Measure query counts; initialization, batching
  and fetching policy change the result.

## Safe publication in a virtual proxy

```java
// wrong: another thread may see a non-null, partially constructed target
public Report get() {
    if (target == null) target = expensive();
    return target;
}

// For one construction attempt: use an explicit synchronized failure policy, as in worked-example.
// CAS installation alone may construct several candidates before one wins.

// simplest, when creation is idempotent and cheap enough to race
private volatile Report target;
public Report get() {
    Report local = target;
    if (local == null) target = local = expensive();   // may run twice; harmless if pure
    return local;
}
```

The decision is whether double initialisation is acceptable. If `expensive()` opens a file,
registers a listener or increments a counter, it is not, and the initialisation must be guarded
with explicit failure/retry/cleanup policy. Pure duplicate construction can be acceptable when
different identities are allowed; volatile safely publishes but expensive() itself may block.
Do not call the entire path lock-free without a progress argument (`java-memory-model`).

## Protection proxies that do not protect

```java
// bypass: a caller subject to the guard can obtain the unchecked target
DocumentStore raw = context.getBean(FileDocumentStore.class);   // bypasses SecuredDocumentStore
```

A protection proxy needs every relevant caller to pass the required check. A separately authorized
maintenance path is not itself a defect; an unchecked path exposed to protected callers is.
Ways to enforce that boundary:

- Restrict subject visibility and wiring within the relevant trust boundary; package-private alone
  does not protect against all same-package code, reflection or other raw-object access paths.
- The subject is constructed by the proxy and never exposed.
- The check moves into the subject, where no wrapper can be omitted — usually the most robust
  option, at the cost of mixing policy with the operation.

Ordinary Spring proxy-based method security inherits self-invocation bypass; verify the configured
mode and any enforcement already established at the outer entry point.

### Cache hits are also access paths

An outer cache can return a saved result before an inner protection proxy or method-body check
runs. A previously authorized read followed by permission revocation can then return protected
data even though callers never obtained the raw target. Trace the actual chain and require the
relevant policy on the hit path, including result-level filtering where needed; do not infer a
safe order from annotation order in source.

This consequence follows from caching's short-circuit behavior, documented for
[Spring 6.2 `@Cacheable`](https://docs.spring.io/spring-framework/reference/6.2/integration/cache/annotations.html).
Its default keys use method arguments, not arbitrary caller context. When tenant or caller context
changes the result or visibility, include the required partitioning or move caching behind an
appropriate policy boundary. Partitioning does not by itself recheck expired permissions. Public,
context-independent values can remain shared; a cache is not automatically a security defect.

Verify a miss, a hit after revocation and two callers whose permitted views differ. Observe both
returned data and whether the required check ran. Keep cache freshness/eviction design separate
from this proxy's obligation to preserve the access contract.

## Identity and unwrapping

| Need                                     | Mechanism                                 |
| ---------------------------------------- | ----------------------------------------- |
| The real bean in a test                  | `AopTestUtils.getTargetObject(bean)`      |
| The real class of a proxied bean         | `AopProxyUtils.ultimateTargetClass(bean)` |
| The real entity behind a Hibernate proxy | `Hibernate.unproxy(entity)`               |
| A JDBC driver's native object            | `Wrapper.unwrap(Class)`                   |

Restrict unwrap to justified infrastructure use. Never expose an authorization/lifecycle bypass
merely to support identity checks; test policy through the proxy itself.

Sources: [Java 17 Proxy contracts](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/reflect/Proxy.html),
[InvocationHandler exception contracts](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/reflect/InvocationHandler.html),
[CompletionStage outcomes](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/CompletionStage.html),
[Spring proxying](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html),
[programmatic transaction boundaries](https://docs.spring.io/spring-framework/reference/data-access/transaction/programmatic.html), and
[Hibernate 6.6 proxy/enhancement behavior](https://docs.hibernate.org/orm/6.6/javadocs/org/hibernate/Hibernate.html).
