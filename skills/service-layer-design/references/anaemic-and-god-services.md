# Anaemic Layers and God Services

Two opposite pathologies with one root cause: nobody decided what the layer is for.

## The pass-through service layer

```java
@Service
@RequiredArgsConstructor
public class CustomerService {
    private final CustomerRepository repository;

    @Transactional(readOnly = true)
    public Customer findById(Long id) { return repository.findById(id).orElseThrow(); }

    @Transactional
    public Customer save(Customer customer) { return repository.save(customer); }

    @Transactional
    public void delete(Long id) { repository.deleteById(id); }

    public List<Customer> findAll() { return repository.findAll(); }
}
```

### What it costs

- Extra indirection if the wrapper adds no contract; annotations may supply real behavior.
- Generic persistence vocabulary may hide intent; `save` is not universally an upsert.
  Check new-entity detection, merge semantics and actual SQL.
- It teaches the codebase that the service layer is a forwarding convention, which is
  exactly the belief that produces the god service later.
- Separate calls without a surrounding transaction can commit independently. With an outer
  transaction, REQUIRED calls usually participate in it; inspect propagation and manager
  rather than counting annotations (`enterprise-transactions`).

### When it is nevertheless correct

Do not delete a thin layer reflexively. It is justified when:

- **Some** methods in the module are genuine use cases, and consistency of the call site
  matters more than the empty methods.
- The layer defines transaction, authorization, audit or read consistency uniformly,
  including for non-HTTP callers.
- A remote or asynchronous caller needs a stable operation surface that is not the
  repository (`remote-facade-and-dto`).

It is not justified by "we might need it later" or by symmetry with other modules.

### The fix

Delete pass-throughs only after checking authorization, transaction, caching, audit and stable API
semantics. Let a controller or query handler use a read gateway directly where those duties do not
apply. Measure the resulting surface; no general removal percentage is defensible.

## The god service

`OrderService`, 3 200 lines, 40 public methods, 11 injected collaborators, imported by
everything.

### How it forms

It often emerges incrementally rather than by explicit decision: a pass-through layer has no clear
responsibility; the service already holds the
transaction and every repository, so each new rule is cheapest to add there; entities have
setters, so the rule can be written as read-branch-write; nobody objects because each
individual addition is two lines.

### Detection, from the code

| Signal                                 | Threshold worth investigating                             |
| -------------------------------------- | --------------------------------------------------------- |
| Injected collaborators                 | unrelated capability clusters or high fixture/change cost |
| Public methods                         | unrelated vocabulary and consumers, not a numeric cutoff  |
| Conditionals mentioning entity state   | investigate whether protocol/orchestration or domain rule |
| Entity setters called from the service | state transitions bypassing an invariant owner            |
| Methods no caller uses together        | evidence of separable ownership/change clusters           |
| Test setup length                      | fixtures longer than the assertions                       |

### Detection, from the history

Stronger evidence than any static metric:

```bash
git log --format='%h %ad %an' --date=short --numstat -- src/**/OrderService.java \
  | grep -E '^[0-9]+' | awk '{added+=$1} END {print added" lines added"}'

# Which features touch it? If unrelated features all edit one file, it has no
# single responsibility, regardless of the class's size.
git log --format='%s' -- src/**/OrderService.java | sort | uniq -c | sort -rn | head
```

A class edited by every feature team, for unrelated reasons, is the definition of the
problem — and it is also a merge-conflict hotspot, which is usually the pain that finally
gets it prioritised.

### The fix, in order

1. **Split by use case first.** Move each cluster of methods into its own class named after
   the use case. First characterize callers, proxy interception, authorization and transaction
   behavior: moving methods can activate advice formerly bypassed by self-invocation.
   Preserve those contracts during each extraction.
2. **Then place domain rules according to the selected model.** In domain-model style, move
   invariant ownership to the entity or appropriate policy. A conditional alone is not proof;
   retain deliberate Transaction Scripts. Check reflective/serialization callers before
   removing setters; compilation cannot find every consumer.
3. **Re-check transaction boundaries throughout extraction.** Splitting often reveals that one former
   method was two transactions pretending to be one, or vice versa.
4. **Only then consider a domain service** for what genuinely belongs to no object.

Use small, independently reviewable extractions with relevant validation passing. Create
commits only when explicitly requested (`architecture-refactoring-paths`).

## The intermediate case: the service that only validates

```java
public Order approve(Long id) {
    Order order = repository.findById(id).orElseThrow();
    if (order.getStatus() != DRAFT) throw new IllegalStateException();
    order.setStatus(APPROVED);
    return repository.save(order);
}
```

This is a placement question, not proof of a god service. In a rich domain model,
`order.approve()` can centralize the invariant; in a deliberate Transaction Script this shape
can be appropriate. Preserve concurrency/version checks and all callers when moving it.

## Deciding whether to keep the layer at all

Answer per module, with evidence:

1. Which transaction/read-consistency contracts does the layer own, including single writes?
2. Which coordination or stable invocation contracts would callers lose?
3. Is authorisation decided here, and is there a non-HTTP caller that depends on it?
4. Would deleting the layer put framework types into the domain, or business rules into
   controllers? _(Yes → keep it; that is a real containment role.)_

If no meaningful duties remain, direct bounded gateway/repository use may simplify the
module. Check caching, audit, public API and framework interception too; record why removal
preserves behavior rather than applying a numeric deletion rule.
