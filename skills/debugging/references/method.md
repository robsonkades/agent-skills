# The method in detail

## Shrinking a reproduction

The goal is a reproduction where removing any element makes the fault disappear. Work in this
order, because each step makes the next cheaper:

1. **Data** — try subsets and their complements, keeping a smaller input only when the same
   failure persists. If neither half fails, retain interacting elements and use smaller removals;
   a pairwise interaction can span both halves. Preserve a known failing original.
2. **Steps** — remove operations from the sequence. Many "only fails after a full checkout
   flow" faults collapse to two calls in a particular order (which is itself the finding:
   temporal coupling, java-clean-code).
3. **Configuration** — revert to defaults one property at a time. A fault that disappears at a
   default implicates that setting or an interaction; it does not by itself identify a defect.
4. **Environment** — drop from the cluster to a single node, from the container to the JVM,
   from the framework to a `main`. Preserve the failure signature; changing a layer can mask a
   cause or expose a different failure rather than eliminate that layer as a contributor.
5. **Concurrency** — one application caller does not eliminate background threads, callbacks,
   other processes or prior corrupted state. A fully controlled sequential reproduction can
   demonstrate that the reproduced failure does not require concurrent execution.

When shrinking stops working, keep the smallest reproduction that still preserves the fault.
An interaction is one candidate, but missing harness capabilities or the reduction budget can
also explain why no smaller case was found. Test the boundaries you cannot yet remove rather
than treating failed reduction as proof of a cross-boundary cause.

## Differential diagnosis: what changed

For a fault that appeared rather than always existed, the cause is in something that changed.
Enumerate systematically rather than starting with the most recent code change:

| Candidate      | How to check                                                     |
| -------------- | ---------------------------------------------------------------- |
| Code           | Deployment history against the fault's first occurrence          |
| Configuration  | Config/secret change history — often not in the same repo        |
| Data           | A row, a customer or a tenant that first appeared around then    |
| Dependency     | A transitive version bump; `mvn dependency:tree` before/after    |
| Infrastructure | Node, image, kernel, JDK patch, database version, network policy |
| Traffic        | Volume, mix, a new client, a retry storm from upstream           |
| Time           | Month end, DST transition, a certificate or token expiry         |

A fault that starts at exactly 00:00 UTC, on the 1st, or the Sunday a clock changed makes time
boundaries worth testing. Compare clock/date handling with scheduled work and coincident changes;
timing narrows hypotheses but does not by itself establish the cause.

## Bisection

`git bisect run` needs a reliable classifier: exit `0` for good; `1`–`127` except `125` for bad;
`125` for an untestable revision; `128` or higher to abort. A missing command (`127`) or an
unrelated build failure must not silently classify the target fault as present. Deliberately map
known revision incompatibilities to skip and infrastructure/harness failures to abort. Verify
both endpoints, keep dependencies/data stable and use an isolated checkout to preserve edits.

Keep the classifier and reproducer unchanged across checkouts, preferably outside the checkout
being bisected. If compatibility adaptations are necessary, record them and preserve the same
failure predicate. A successful test command is not enough: verify that the intended case actually
executed and evaluated its assertion. A missing, skipped or undiscovered test is not a good
revision; classify it through the skip/abort policy above. Likewise, count a bad result only when
it matches the target failure, not merely because some test failed.

```
git bisect start <bad> <good>
git bisect run ./reproduce.sh
git bisect log
git bisect reset
```

The sketch assumes a POSIX shell and an unchanged executable harness at `./reproduce.sh`;
use its external path instead when keeping it outside the checkout. Save the log before reset. Skipped
revisions can leave several possible first-bad commits. Re-test the candidate and its relevant
parent with the same harness; a regression boundary is not automatically the original defect.
For intermittent faults, repeat enough to bound false-good risk under stated independence/rate
assumptions; finite successful runs do not prove absence. Preserve counts and uncertain outcomes.

Bisection also applies to things that are not commits: halve the config file, halve the
dataset, halve the list of enabled modules. Any monotone property can be bisected.

## Reading exception chains

```
java.lang.IllegalStateException: could not settle order ord-77
    at billing.Settlement.settle(Settlement.java:42)
    ...
Caused by: java.sql.SQLException: deadlock victim
```

- The **top** line is the outermost translation — usually your own layer boundary, and usually
  the least informative about the cause.
- The deepest recorded `Caused by` is a useful starting point, not proof of the initiating fault;
  earlier corruption, translation or omitted causes may be outside the chain.
- The deepest frame **in your own package** is often the first useful boundary breakpoint. It is
  not proof of ownership: framework callbacks, generated adapters, reflection, native transitions,
  and genuine library defects can put the causal behaviour elsewhere.
- `Suppressed:` often records try-with-resources cleanup failures, but application/library code
  can also call `addSuppressed`. Read these alongside the primary exception without assuming origin.

An exception rewrapped without its cause (`throw new X(e.getMessage())`) destroys this entire
structure. If you meet one while debugging, fixing it is the fastest available progress
(java-exception-design).

## Intermittent faults

A fault that appears one time in N may depend on an uncontrolled input or execution condition.
Choose among these candidates using the observed distribution:

- **Concurrency** — interleaving, visibility, a shared mutable field (concurrency-diagnostics).
- **Ordering** — hash iteration order, a set where a list was assumed, parallel stream order.
- **Time** — a timeout that usually wins the race, a clock skew, a cache TTL boundary.
- **Environment** — one node out of six with different config, an old pod, a stale image.
- **Data** — one record with a null, an empty string, a non-ASCII character, a leap day.

When waiting dominates the investigation, consider a bounded experiment that raises the
reproduction rate: repeat the case, vary timeouts or concurrency, or restrict to one node.
Use an isolated environment or existing incident authority with explicit load, effect and time
limits; replaying real requests can repeat their side effects. Preserve the original failure
signature and compare controls: a shorter deadline or extra load may create a different failure.
Existing evidence may already discriminate causes without amplifying the fault.

## Heisenbugs

When adding logging, attaching a debugger or enabling assertions makes the fault disappear, the
observation itself changed the timing or the optimisation. That is evidence, not an obstacle:

- Disappears under a debugger or with extra logging → timing sensitivity. A race is one candidate;
  changed deadlines, queueing, buffering, resource pressure, compilation, or instrumentation side
  effects are others. Design the next experiment to separate them.
- Disappears in a debug build or with `-Xint` → execution mode matters. Timing, resource usage,
  data races and compiler defects remain candidates; this is not proof of invalid application code.
- Disappears when a field is made `volatile` → ordering or timing may matter. Prove the needed
  happens-before relation and compound-operation atomicity before accepting a visibility diagnosis.

Prefer bounded, lower-perturbation instrumentation over synchronous logging inside the suspect
path. Sampling, JFR and counters also change execution; compare instrumented/control runs.

## When the model is wrong

After repeated refutations within the agreed timebox, inspect the model and experiment itself:

- Go back to raw observations and re-read them without the current theory.
- Verify an assumption you have not checked because it is "obviously" true — that the config
  in use is the config in the repo, that the version deployed is the version tagged, that the
  request reached the service at all.
- State the theory out loud to someone. Most of the value arrives before they answer.

Sources: [Git bisect exit protocol](https://git-scm.com/docs/git-bisect)
and [Throwable cause/suppression API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Throwable.html).
