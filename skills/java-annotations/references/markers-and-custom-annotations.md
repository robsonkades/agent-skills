# Markers, custom annotations and enforcement

## Marker interface or marker annotation

Both say "this thing is special". They differ in what the compiler can do about it.

| Question                                                      | Marker interface | Marker annotation                          |
| ------------------------------------------------------------- | ---------------- | ------------------------------------------ |
| Can it be a parameter or return type?                         | **yes**          | no                                         |
| Is misuse caught at compile time?                             | **yes**          | no — only at runtime, by whatever reads it |
| Can it mark a method, field, parameter, package or module?    | no               | **yes**                                    |
| Can it be added without changing the type hierarchy?          | no               | **yes**                                    |
| Can it carry parameters later without breaking existing uses? | n/a              | **yes** (with defaults)                    |
| Does it affect the type's API surface / subtyping?            | yes              | no                                         |

The decision rule that follows:

- **Marker interface** when the marker means "instances of this type may be passed to X" and
  you can express X's parameter as the marker type. That is the whole argument: the check moves
  from runtime to the compiler. A method taking `Serializable` rejects non-serialisable types
  at compile time; a method taking `Object` and checking an annotation cannot.
- **Marker annotation** when the target is not a type, when retrofitting existing types you do
  not own, or when the marker is likely to gain attributes.

Note that the JDK's own markers are split exactly this way: `Serializable` and `Cloneable` are
interfaces (they mark types and change what the platform does with instances), while
`@FunctionalInterface`, `@Deprecated` and `@Override` are annotations (they mark declarations
for the compiler). And a marker interface with no methods still has the downside every
interface has — it is permanent API surface. A marker that only a framework consumes is better
as an annotation.

## Designing a custom annotation

```java
/**
 * Marks a value that must never be logged, serialised or returned in an API response.
 * Enforced by {@code SensitiveDataProcessor} at compile time and by the log redactor at runtime.
 */
@Documented
@Retention(RUNTIME)                                        // the redactor reflects over it
@Target({ FIELD, PARAMETER, RECORD_COMPONENT, METHOD })    // only if consumers inspect all four
public @interface Sensitive {
    /** How the value is rendered when redaction applies. */
    Redaction value() default Redaction.MASKED;
}
```

Checklist for any annotation you define:

- [ ] Javadoc says **who reads it** and what happens when it is present. Without that line, the
      next reader cannot tell whether it is load-bearing.
- [ ] `@Retention` explicit, and matching the reader.
- [ ] `@Target` explicit, covering every declaration the reader inspects — including
      `RECORD_COMPONENT` if records are in scope.
- [ ] `@Documented` if it is part of the API contract (it then appears in Javadoc).
- [ ] Members have defaults wherever possible, so the annotation can gain attributes without
      breaking existing uses. Adding a member **without** a default breaks every existing use at
      compile time.
- [ ] Member return types are limited to the annotation-element types permitted by the JLS;
      supplied values obey the corresponding constant/class-literal/enum/annotation rules.
- [ ] There is a test that the enforcement fires, and a test that it does **not** fire where it
      should not.

## The enforcement gap

The recurring defect is an annotation everyone trusts and nothing enforces. Three concrete
shapes:

**1. Validation constraints with no validator on the path.**

```java
public record CreateOrder(@NotBlank String sku, @Positive int quantity) { }

// Enforced:
@PostMapping void create(@Valid @RequestBody CreateOrder body) { ... }
// Not enforced — no @Valid, so the constraints are decoration:
@PostMapping void create(@RequestBody CreateOrder body) { ... }
// Not enforced — nothing invokes a Validator:
var order = objectMapper.readValue(json, CreateOrder.class);
```

The annotations are identical in all three; only the call path differs. Test the rejection, not
the annotation.

**2. Proxy-based behaviour bypassed by self-invocation.**

```java
@Service
class OrderService {
    public void importAll(List<Order> orders) {
        orders.forEach(this::importOne);      // internal call: the proxy is not involved
    }
    @Transactional public void importOne(Order order) { ... }   // no transaction here
}
```

In ordinary Spring proxy mode the internal call bypasses advice. The same concern applies to
proxy-backed `@Cacheable`, `@Retryable`, `@Async`, `@PreAuthorize`, etc. Private/static methods
cannot be intercepted by ordinary instance proxies; final classes/methods prevent subclass
proxies, while interface proxies and AspectJ weaving differ. Fix structurally (another bean), use
an explicit API such as `TransactionTemplate`, or deliberately configure weaving; verify the
actual proxy kind and call path rather than only asking whether a bean boundary exists.

**3. Security annotations on an unreached path.** An `@PreAuthorize` on a service method
protects that method; it does not protect a second controller that reaches the repository
directly. Annotation-based authorisation is only as complete as the set of entry points that
route through it, which is why the enforcement point belongs at a boundary the design makes
unavoidable.

## When an annotation is the wrong tool

- **Behaviour that the reader of the call site must know about.** Annotation-driven retries,
  transactions and caching are invisible at the call site by design; that is convenient until
  someone debugs a latency spike caused by a retry they could not see. Prefer explicit code for
  behaviour with operational consequences, or make the annotation's effect visible in traces
  and metrics.
- **Configuration that varies per environment.** Annotation members are compile-time constants.
  A timeout, a pool size or a feature flag in an annotation is a redeploy away from every
  change.
- **Anything a type could express.** A `@NonNull String` parameter is weaker than a value type
  that cannot be constructed empty; an `@Ordered(3)` is weaker than an explicit ordered list in
  a configuration class. Types and data structures are checked; annotations are read by
  whoever remembers to read them.
- **Cross-cutting rules you can enforce structurally.** An architecture test asserting "no
  class in the domain package imports a framework type" is stronger than an annotation saying
  the same thing, because it cannot be forgotten on a new class — see architecture-testing.
