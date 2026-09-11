# Anaemic Layers and God Services

Two possible pathologies to investigate through the layer's actual duties and change costs.

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
- Forwarding by convention can obscure responsibility; it does not itself predict a god service.
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

Speculative future duties or symmetry alone are weak reasons; preserve an established caller
contract when the cost of changing it outweighs the current indirection.

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
| Test setup                             | unrelated collaborators required for a focused operation  |

### Detection, from the history

Use history to investigate change clusters alongside code and callers. This Bash example
captures one Git producer before analysis, using a quoted Git pathspec from the repository
root. It retains raw stdout/stderr in a private temporary directory; inspect that path even
on failure. It does not follow renames or reconstruct feature ownership.

```bash
(
set -euo pipefail
history_dir=$(mktemp -d "${TMPDIR:-/tmp}/service-history.XXXXXXXX")
printf 'Raw history: %s\n' "$history_dir" >&2
if git log --format='commit %h %ad %s' --date=short --numstat \
    -- ':(glob)src/**/OrderService.java' \
    >"$history_dir/history.out" 2>"$history_dir/history.err"; then
    cat "$history_dir/history.err" >&2
else
    status=$?
    cat "$history_dir/history.err" >&2
    printf 'Git failed (status %s); partial stdout is not evidence.\n' "$status" >&2
    exit "$status"
fi
if [[ ! -s "$history_dir/history.out" ]]; then
    printf 'No matching history; verify path, revisions and rename coverage.\n'
else
    awk -F '\t' '
      NF == 3 && $1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ { added += $1; rows++ }
      NF == 3 && $1 == "-" && $2 == "-" { binary++ }
      END { printf "Numeric additions: %.0f across %d rows; binary rows: %d\n",
                   added, rows, binary }
    ' "$history_dir/history.out"
    # Read commit subjects and patches to classify actual reasons for changes.
    cat "$history_dir/history.out"
fi
)
```

Numeric additions count added-line churn, not net growth, unique lines or feature count;
binary changes have no numeric line count. Successful empty output is missing matching
evidence, not proof of cohesion. Subject wording, bulk formatting, generated changes and
incomplete history can confound the result. Inspect representative changes and caller duties
before concluding that unrelated responsibilities justify a split.

### The fix, in order

1. **Choose a cohesive extraction when evidence justifies it.** A use case or a related
   capability cluster can be the boundary; an entity-named service may already be cohesive.
   First characterize callers, proxy interception, authorization and transaction
   behavior: moving methods can activate advice formerly bypassed by self-invocation.
   Preserve those contracts during each extraction.
2. **Then place domain rules according to the selected model.** In domain-model style, move
   invariant ownership to the entity or appropriate policy. A conditional alone is not proof;
   retain deliberate Transaction Scripts. Check reflective/serialization callers before
   removing setters; compilation cannot find every consumer.
3. **Re-check transaction boundaries throughout extraction.** Splitting often reveals that one former
   method was two transactions pretending to be one, or vice versa.
4. **Consider a domain service where the rule belongs to no object.** This is an ownership
   decision, not a required final extraction step.

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

## Command contracts

- [Bash pipeline status](https://www.gnu.org/software/bash/manual/html_node/Pipelines.html) and [assignment status](https://www.gnu.org/software/bash/manual/html_node/Simple-Command-Expansion.html) — why producer failures must be checked before interpreting output; the example runs in its own subshell.
- [Git 2.51.0 numstat documentation](https://github.com/git/git/blob/v2.51.0/Documentation/diff-options.adoc) and [pathspec documentation](https://github.com/git/git/blob/v2.51.0/Documentation/glossary-content.adoc) — numeric/binary rows and explicit Git glob semantics. Check the installed Git/Bash and adapt paths to the repository; these commands do not establish a causal architecture diagnosis.
