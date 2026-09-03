# The method in detail

## Shrinking a reproduction

The goal is a reproduction where removing any element makes the fault disappear. Work in this
order, because each step makes the next cheaper:

1. **Data** — halve the input, keep the failing half. On a 40-column CSV this usually reaches
   one row and three columns in six steps.
2. **Steps** — remove operations from the sequence. Many "only fails after a full checkout
   flow" faults collapse to two calls in a particular order (which is itself the finding:
   temporal coupling, java-clean-code).
3. **Configuration** — revert to defaults one property at a time. A fault that disappears at a
   default is a fault about that setting, and you have just found it.
4. **Environment** — drop from the cluster to a single node, from the container to the JVM,
   from the framework to a `main`. Each layer removed is a layer eliminated as the cause.
5. **Concurrency** — if it reproduces single-threaded, it is not a race. That is one of the
   most valuable facts you can establish early, in either direction.

When shrinking stops working — the fault needs the full system — that is data too: the cause is
in an interaction, and the candidates are the boundaries you cannot remove.

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

The last row is the one people miss for longest. A fault that starts at exactly 00:00 UTC, or
on the 1st, or the Sunday a clock changed, is telling you its cause in its timing.

## Bisection

`git bisect` needs one thing to be useful: a script that exits non-zero on the fault and zero
otherwise, reliably. Build that first — even a slow one. Over 500 commits it is nine runs.

```
git bisect start <bad> <good>
git bisect run ./reproduce.sh
```

If the reproduction is intermittent, bisect lies. Make the script run the case enough times
that a false "good" is unlikely, and accept the runtime.

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
- The **bottom** `Caused by` is the original fault. Read it first.
- The deepest frame **in your own package** is often the first useful boundary breakpoint. It is
  not proof of ownership: framework callbacks, generated adapters, reflection, native transitions,
  and genuine library defects can put the causal behaviour elsewhere.
- `Suppressed:` entries come from try-with-resources — a close() that failed while another
  exception was propagating. They are easy to miss and sometimes carry the real cause.

An exception rewrapped without its cause (`throw new X(e.getMessage())`) destroys this entire
structure. If you meet one while debugging, fixing it is the fastest available progress
(java-exception-design).

## Intermittent faults

A fault that appears one time in N is a fault with an unstated input. Candidates, in the order
they are usually the answer:

- **Concurrency** — interleaving, visibility, a shared mutable field (concurrency-diagnostics).
- **Ordering** — hash iteration order, a set where a list was assumed, parallel stream order.
- **Time** — a timeout that usually wins the race, a clock skew, a cache TTL boundary.
- **Environment** — one node out of six with different config, an old pod, a stale image.
- **Data** — one record with a null, an empty string, a non-ASCII character, a leap day.

Raise the reproduction rate before investigating: run the case in a loop, shrink timeouts,
increase concurrency, restrict to one node. A fault reproducing 50% of the time is tractable;
one reproducing 1% will consume the investigation in waiting.

## Heisenbugs

When adding logging, attaching a debugger or enabling assertions makes the fault disappear, the
observation itself changed the timing or the optimisation. That is evidence, not an obstacle:

- Disappears under a debugger or with extra logging → timing sensitivity. A race is one candidate;
  changed deadlines, queueing, buffering, resource pressure, compilation, or instrumentation side
  effects are others. Design the next experiment to separate them.
- Disappears in a debug build or with `-Xint` → a JIT-visible data race, or reliance on
  behaviour the optimiser is entitled to change (java-memory-model).
- Disappears when a field is made `volatile` → a visibility bug. Do not stop there: `volatile`
  may have fixed the symptom while the atomicity problem remains.

Prefer instrumentation that does not change timing — sampling profilers, JFR events, counters
read afterwards — over synchronous logging inside the suspect path.

## When the model is wrong

Two hours of refuted hypotheses means the mental model of the system is wrong, not that the
next hypothesis needs to be cleverer. Recovery:

- Go back to raw observations and re-read them without the current theory.
- Verify an assumption you have not checked because it is "obviously" true — that the config
  in use is the config in the repo, that the version deployed is the version tagged, that the
  request reached the service at all.
- State the theory out loud to someone. Most of the value arrives before they answer.
