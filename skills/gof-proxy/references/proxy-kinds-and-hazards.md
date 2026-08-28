# Proxy kinds, mechanics and hazards

## The four kinds

| Kind                | Controls                     | Typical use                                      | Principal hazard                                          |
| ------------------- | ---------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| **Virtual**         | When the subject is created  | Expensive resources; JPA lazy associations       | Publication races; work triggered from an innocent getter |
| **Remote**          | Where the subject lives      | RPC stubs, service clients                       | Latency and partial failure presented as local behaviour  |
| **Protection**      | Who may call                 | Authorisation wrappers                           | Bypassable when the subject is reachable directly         |
| **Smart reference** | Bookkeeping around each call | Caching, counting, logging, `synchronized` views | Becomes a decorator in disguise; hidden cost per call     |

## Proxy against Decorator

| Question                                               | Proxy                         | Decorator                     |
| ------------------------------------------------------ | ----------------------------- | ----------------------------- |
| Does the caller have another way to reach the subject? | Usually no                    | Usually yes                   |
| Are several of them stacked, in a chosen order?        | Rarely                        | Yes, and order matters        |
| Who decides it exists?                                 | The subject's owner/framework | Whoever wires the object      |
| Does it manage the subject's lifecycle?                | Often (creates it, holds it)  | No — it is given the delegate |

Both implement the subject's interface, which is why the distinction is behavioural rather than
structural. If you find yourself stacking three proxies in a deliberate order, you have
decorators and should reason about them with `gof-decorator`.

## JDK dynamic proxies against bytecode subclassing

```java
// JDK: interfaces only
Foo foo = (Foo) Proxy.newProxyInstance(loader, new Class<?>[]{ Foo.class },
        (p, method, args) -> { /* before */ return method.invoke(target, args); });

// CGLIB / ByteBuddy: generates a subclass, so it can proxy classes
```

| Mechanism         | Requires                                    | Cannot intercept                                                      |
| ----------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| JDK dynamic proxy | An interface                                | Anything not on the interface                                         |
| Subclass (CGLIB)  | A non-final class with a usable constructor | `final` classes, `final` methods, `private` methods, `static` methods |

Consequences that bite in practice:

- Making a service class `final` — a reasonable default otherwise — disables Spring's
  subclass-based proxying for it.
- A `private` `@Transactional` method is never advised; some versions warn, some do not.
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
    public void save(Row row) { ... }  // no transaction when called from importAll
}
```

The annotation works by the caller holding the proxy. An internal call goes straight to the
target, so the transaction, the cache lookup, the async dispatch or the retry simply does not
happen — and nothing fails, which is what makes it dangerous.

Three fixes, best first:

1. **Move the annotated method to another bean.** The call then crosses the proxy. This is
   usually also the better design, because the annotated behaviour is a different responsibility.
2. **Inject self.** `@Lazy OrderService self` and call `self.save(row)`. Works, and reads as the
   workaround it is.
3. **`AopContext.currentProxy()`.** Requires `exposeProxy = true` and couples the code to Spring
   AOP. Last resort.

Detection: any annotated method invoked without a receiver from within its own class. Worth an
architecture test in codebases where this has happened once (`architecture-testing`).

## JPA lazy proxies

Hibernate returns a subclass instance for a lazy association. Consequences:

```java
Customer c = order.getCustomer();          // a proxy, not a Customer
c.getClass();                              // Customer$HibernateProxy$xyz
c instanceof PremiumCustomer               // false, even when the row is a premium customer
c.equals(realCustomer)                     // false unless equals is id-based
Hibernate.unproxy(c)                       // the real instance, if the session is open
```

- **`instanceof` against a subclass fails.** Inheritance hierarchies plus lazy loading is a
  reliable source of behaviour that differs between a freshly persisted object and one loaded
  from the database (`inheritance-mapping-strategies`).
- **`equals`/`hashCode` must be id-based**, and must use a getter rather than direct field access,
  or the proxy compares its own uninitialised fields (`orm-structural-mapping`).
- **`LazyInitializationException`** is the proxy escaping the scope that could initialise it. The
  fix is to decide at the boundary what the caller needs — a fetch join, an entity graph, or a
  projection — not to widen the session (`orm-behavioral-patterns`,
  `query-objects-and-specifications`).
- **A lazy proxy dereferenced in a loop is an N+1.** The loop body looks like field access.

## Safe publication in a virtual proxy

```java
// wrong: another thread may see a non-null, partially constructed target
public Report get() {
    if (target == null) target = expensive();
    return target;
}

// right, when creation must happen at most once
private final Supplier<Report> target = memoize(this::expensive);   // e.g. a holder or
                                                                     // AtomicReference CAS

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
so it happens once. If it is a pure computation, the racy-but-`volatile` form is correct and
lock-free (`java-memory-model`).

## Protection proxies that do not protect

```java
// the check is advisory if this is possible anywhere in the codebase
DocumentStore raw = context.getBean(FileDocumentStore.class);   // bypasses SecuredDocumentStore
```

A protection proxy is only a control if the subject is unreachable. Ways to make that true:

- The subject is package-private and the proxy is the only exported type.
- The subject is constructed by the proxy and never exposed.
- The check moves into the subject, where no wrapper can be omitted — usually the most robust
  option, at the cost of mixing policy with the operation.

Framework-based security (`@PreAuthorize`) is a proxy and inherits every limitation above,
including self-invocation: an internal call to a `@PreAuthorize` method is unchecked.

## Identity and unwrapping

| Need                                     | Mechanism                                 |
| ---------------------------------------- | ----------------------------------------- |
| The real bean in a test                  | `AopTestUtils.getTargetObject(bean)`      |
| The real class of a proxied bean         | `AopProxyUtils.ultimateTargetClass(bean)` |
| The real entity behind a Hibernate proxy | `Hibernate.unproxy(entity)`               |
| A JDBC driver's native object            | `Wrapper.unwrap(Class)`                   |

Publish an unwrap path for your own proxies if callers may need identity, and make it explicit
rather than letting callers discover `getClass().getSuperclass()`.
