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

- A file, a test file, and a mock in every test of the caller — for no behaviour.
- A misleading contract: `save` promises a use case and delivers an upsert with no rule.
- It teaches the codebase that the service layer is a forwarding convention, which is
  exactly the belief that produces the god service later.
- `@Transactional` per repository call means a use case that needs two calls gets two
  transactions and can half-fail (`enterprise-transactions`).

### When it is nevertheless correct

Do not delete a thin layer reflexively. It is justified when:

- **Some** methods in the module are genuine use cases, and consistency of the call site
  matters more than the empty methods.
- The layer is where authorisation is applied uniformly, including for non-HTTP callers.
- A remote or asynchronous caller needs a stable operation surface that is not the
  repository (`remote-facade-and-dto`).

It is not justified by "we might need it later" or by symmetry with other modules.

### The fix

Delete the pass-throughs; keep the methods that orchestrate. Let the controller or the
query handler use the repository directly for reads. This usually removes 60–80% of such a
class and makes the remainder obviously meaningful.

## The god service

`OrderService`, 3 200 lines, 40 public methods, 11 injected collaborators, imported by
everything.

### How it forms

It is never a decision. The sequence is always the same: the service layer starts as
pass-through, so it has no defined responsibility; the service already holds the
transaction and every repository, so each new rule is cheapest to add there; entities have
setters, so the rule can be written as read-branch-write; nobody objects because each
individual addition is two lines.

### Detection, from the code

| Signal                                 | Threshold worth investigating                             |
| -------------------------------------- | --------------------------------------------------------- |
| Injected collaborators                 | more than ~6                                              |
| Public methods                         | more than ~15, or methods whose names share no vocabulary |
| Conditionals mentioning entity state   | any; each one is a rule outside the model                 |
| Entity setters called from the service | any on a state field                                      |
| Methods no caller uses together        | two clusters that never co-occur = two services           |
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
   the use case. This is mechanical, safe, and immediately reduces conflicts. Do it before
   any domain modelling — untangling logic inside a 3 000-line class is far harder than
   untangling it inside five 200-line ones.
2. **Then push rules down.** For each remaining conditional on entity state, move it into
   the entity and delete the setter it depended on. The compiler finds the other callers.
3. **Then re-check the transaction boundaries.** Splitting often reveals that one former
   method was two transactions pretending to be one, or vice versa.
4. **Only then consider a domain service** for what genuinely belongs to no object.

Do not attempt this as one change. Each extracted use case should be its own commit with
its own tests passing (`architecture-refactoring-paths`).

## The intermediate case: the service that only validates

```java
public Order approve(Long id) {
    Order order = repository.findById(id).orElseThrow();
    if (order.getStatus() != DRAFT) throw new IllegalStateException();
    order.setStatus(APPROVED);
    return repository.save(order);
}
```

This is the god service at 12 lines — the same read-branch-write shape. It is worth fixing
early precisely because it is small: `order.approve()` with a private `requireDraft()` is a
five-minute change now and a three-week programme once forty methods share the pattern.

## Deciding whether to keep the layer at all

Answer per module, with evidence:

1. How many methods demarcate a transaction spanning more than one write? _(0 → the layer
   is not carrying its main justification.)_
2. How many contain orchestration — two or more collaborators? _(0 → same.)_
3. Is authorisation decided here, and is there a non-HTTP caller that depends on it?
4. Would deleting the layer put framework types into the domain, or business rules into
   controllers? _(Yes → keep it; that is a real containment role.)_

Zero, zero, no, no: delete the layer in that module and call the repositories directly.
That is a legitimate architecture, not a lapse, and stating it deliberately stops the
pass-through classes from being reintroduced by the next person applying the house style.
