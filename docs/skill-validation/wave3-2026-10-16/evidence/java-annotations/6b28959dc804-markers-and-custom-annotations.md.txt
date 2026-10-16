# Markers, custom annotations and enforcement

## Marker interface or marker annotation

Both say "this thing is special". They differ in what the compiler can do about it.

| Question                                                      | Marker interface   | Marker annotation                                            |
| ------------------------------------------------------------- | ------------------ | ------------------------------------------------------------ |
| Can it be a parameter or return type?                         | **yes**            | no                                                           |
| Is misuse caught at compile time?                             | type assignability | target/syntax; semantic checks need a compiler/tool consumer |
| Can it mark a method, field, parameter, package or module?    | no                 | **yes**                                                      |
| Can it be added without changing the type hierarchy?          | no                 | **yes**                                                      |
| Can it carry parameters later without breaking existing uses? | n/a                | **yes** (with defaults)                                      |
| Does it affect the type's API surface / subtyping?            | yes                | no                                                           |

The decision rule that follows:

- **Marker interface** when the marker means "instances of this type may be passed to X" and
  you can express X's parameter as the marker type. That is the whole argument: the check moves
  from runtime to the compiler. A method taking `Serializable` rejects arguments whose static
  types are not assignable to it; this does not prove that the reachable object graph can be
  serialized. An annotation processor can enforce custom compile-time rules, but an annotation
  alone does not create a subtype constraint.
- **Marker annotation** when the target is not a type, when annotating editable declarations
  without changing their hierarchy, or when the marker may gain attributes. Unowned classes
  require a consumer-supported external metadata/mixin mechanism or a wrapper; an annotation
  cannot simply be attached to somebody else's compiled class.

Note that the JDK's own markers are split exactly this way: `Serializable` and `Cloneable` are
interfaces (they mark types and change what the platform does with instances), while
`@FunctionalInterface`, `@Deprecated` and `@Override` are annotations (they mark declarations
for the compiler). And a marker interface with no methods still has the downside every
interface has — it is API surface consumers may rely on. A framework-only marker may be simpler
as an annotation when that framework supports it; preserve contractual subtyping and existing users.

## Designing a custom annotation

Partial design sketch: imports, `Redaction`, processor and runtime redactor are omitted.
The Javadoc is a proposed contract, not a supplied security implementation. Test hostile
secret values through each actual logging/serialization/response path before claiming coverage.

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
- [ ] `@Target` explicit for the selected access strategy; use `RECORD_COMPONENT` when the
      reader inspects record components, not merely because records exist.
- [ ] `@Documented` if it is part of the API contract (it then appears in Javadoc).
- [ ] New members have defaults only when an omitted value has a valid meaning. Adding a member
      **without** a default breaks recompilation of old uses that omit it; reading that member
      from an old binary can throw `IncompleteAnnotationException`. Changing a default affects
      already compiled uses that omitted the element, so source compatibility is not behavioral
      compatibility. Check old compiled consumers as well as fresh source.
- [ ] Member return types are limited to the annotation-element types permitted by the JLS;
      supplied values obey the corresponding constant/class-literal/enum/annotation rules.
- [ ] Checks cover the consumer's promised effect and its exclusions; enforcement needs accepted
      and rejected inputs, while documentation/generation needs the correct output.

## The enforcement gap

The recurring defect is an annotation everyone trusts and nothing enforces. Three concrete
shapes:

**1. Validation constraints with no validator on the path.**

Partial Spring MVC/Jakarta Validation sketches: they assume compatible dependencies, a
configured provider and MVC validation integration. `@Valid` alone does not supply those.
The alternatives below assume no separate validation interceptor or manual check.

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
    @Transactional public void importOne(Order order) { ... }   // no advice from this internal call
}
```

In ordinary Spring proxy mode the internal call bypasses advice. The same concern applies to
proxy-backed `@Cacheable`, `@Retryable`, `@Async`, `@PreAuthorize`, etc. Private/static methods
cannot be intercepted by ordinary instance proxies; final classes/methods prevent subclass
proxies, while interface proxies and AspectJ weaving differ. Fix structurally (another bean), use
an explicit API such as `TransactionTemplate`, or deliberately configure weaving; verify the
actual proxy kind and call path rather than only asking whether a bean boundary exists.
An outer transaction can still be active; bypassing this advice does not prove no transaction.

**3. Security annotations on an unreached path.** An `@PreAuthorize` on a service method
protects intercepted calls only when method security is enabled and configured; it does not
protect a second controller that reaches the repository
directly. Annotation-based authorisation is only as complete as the set of entry points that
route through it, which is why the enforcement point belongs at a boundary the design makes
unavoidable.

## When an annotation is the wrong tool

- **Behaviour that the reader of the call site must know about.** Annotation-driven retries,
  transactions and caching are invisible at the call site by design; that is convenient until
  someone debugs a latency spike caused by a retry they could not see. Prefer explicit code for
  behaviour with operational consequences, or make the annotation's effect visible in traces
  and metrics.
- **Configuration that varies per environment.** A baked-in literal policy needs a source/build
  change, but a consumer can resolve a constant key or expression externally. For example,
  Spring's `@Scheduled(cron = "${jobs.cron}")` supports a property placeholder. Check when the
  configured consumer resolves it; external configuration does not imply live rescheduling.
  Retain a supported configuration path rather than replacing it merely because it uses metadata.
- **An invariant better expressed in a type or data structure.** A value type can validate
  non-empty text at construction, but its reference can still be null; nullness analysis is a
  separate contract. Compare actual enforcement: a configured annotation checker can provide
  compile-time guarantees, while a type name alone cannot.
- **Cross-cutting rules you can enforce structurally.** An architecture test asserting "no
  class in the domain package imports a framework type" is stronger than an annotation saying
  the same thing, because it cannot be forgotten on a new class — see architecture-testing.

## Primary sources

- [JLS 17 annotation defaults](https://docs.oracle.com/javase/specs/jls/se17/html/jls-9.html#jls-9.6.2)
  specifies how changed defaults affect previously compiled uses.
- [JDK 25 annotation reflection](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/reflect/AnnotatedElement.html)
  documents repeatability and failures when reading evolved annotation members.
- [Spring 7.0.9 Scheduled API](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/scheduling/annotation/Scheduled.html)
  documents supported placeholders/expressions; verify the project's framework version and lifecycle.
