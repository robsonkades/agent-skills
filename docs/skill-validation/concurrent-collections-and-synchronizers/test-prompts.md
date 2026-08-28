# Test prompts — `concurrent-collections-and-synchronizers`

Ten prompts for selection testing: six that must route to this skill, four near misses that must
route to a named neighbour instead. None of them names the skill, and none uses a word that
appears only in its title.

Selection is judged from the **visible 1024 characters** of the description, because that is what
Claude Code shows the selector. The full description is 1373 characters; the cut and what survives
it are recorded in the validation report under "N6 — closed; measured at the cut".

Status column: verified by the independent validator across iterations 1–3, most recently on
2026-08-28 against a corpus of 235 skills.

## Must trigger

1. **"Our per-tenant cache does `map.computeIfAbsent(tenantId, k -> repository.loadConfig(k))`
   and p99 spikes whenever a deploy empties it. Is the map the problem?"**
   The highest-value claim in the skill: `compute*` runs the caller's function while holding the
   monitor on the bin head node, so a blocking loader serialises every writer to that bin behind
   the slowest load. Correct answer routes to `CHM<K, Future<V>>` with the failure-evicting
   memoiser, not to a bigger cache. **Clean.**

2. **"We're getting `IllegalStateException: Recursive update` out of
   `ConcurrentHashMap.computeIfAbsent` in production. It only happens under load."**
   Verbatim trigger, unique to this skill. The answer must not repeat the same-bin folklore that
   failed iteration 1: detection is structural, and the far more dangerous case is the recursion
   that is _not_ detected and leaves the operation silently non-atomic. **Clean.**

3. **"Producer side of our ingest — should it use `offer()`, `put()` or `add()`?"**
   The four-form distinction, with `offer(e, timeout, unit)` as the deliberate backpressure choice
   and a discarded `offer` boolean as silent data loss. **Clean.**

4. **"N workers have to meet at the end of every round and one of them aggregates. `CountDownLatch`
   or `CyclicBarrier`?"**
   The coordinator selection table. `CountDownLatch` is one-shot, so the answer is `CyclicBarrier`
   with its cost stated: the party count is fixed at construction, so one early leaver parks the
   other N−1 forever. **Clean** — carried by the covers clause; the symptom trigger itself falls
   outside the visible 1024.

5. **"This service does `new LinkedBlockingQueue<>()` and hands it to a `ThreadPoolExecutor`.
   Fine?"**
   Deliberately straddles the boundary with `executors-and-task-lifecycle`. Both the trigger and
   that exclusion are visible, so the selector can see where the line falls: the unbounded queue is
   this skill, the pool's rejection policy and lifecycle are the neighbour's.
   **Clean — was ambiguous in iteration 1, fixed in 2.**

6. **"Hot read path, mostly reads. Worth swapping this `ReentrantReadWriteLock` for a
   `StampedLock`?"**
   Choice on capability, with the costs the question does not ask about: not reentrant, no
   ownership, no fairness, and re-entry through a callback or a `toString()` self-deadlocks with no
   deadlock report anywhere. **Mostly clean** — `lock-inflation` also has a claim on `StampedLock`
   non-reentrancy; it was added to the exclusion list in iteration 3, which settles it by statement
   rather than by accident.

## Must NOT trigger

A. **"Is this class thread-safe? It has a shared `HashMap` field and no documentation."**
→ `java-thread-safety-contracts`. This is the policy question — what the class should promise —
which this skill explicitly starts after. **Clean, and now by name in the visible exclusions.**

B. **"Thread dump shows 40 threads BLOCKED on one `synchronized` block."**
→ `lock-inflation` / `concurrency-diagnostics`. A live contention incident, not a selection
decision. **Clean.** In iteration 2 this passed only because `synchronized` happened not to appear
in the visible half; iteration 3 names `monitor contention (lock-inflation)` in the exclusions, so
it is now clean by statement.

C. **"We put a `Semaphore(8)` in front of the payment provider. Is 8 the right number?"**
→ `concurrency-limiting-and-bulkheads` for the pattern, `littles-law-and-queueing` for the
arithmetic. This skill owns the semaphore's _hazards_ — no ownership, over-release silently raising
the limit — never the number. **Clean — was ambiguous in iteration 1, fixed in 2.**

D. **"`JAVA_OPTS` still sets `-Djdk.tracePinnedThreads` and we get no output at all."**
→ `virtual-threads-internals`. The skill states once that pinning stopped being a reason to prefer
`ReentrantLock` after JEP 491, and routes the diagnosis away. **Clean and robust** — the diagnostic
material was deleted rather than relocated, and the exclusion is visible.

## Scoring

| Iteration | Positives clean | Near misses clean                  |
| --------- | --------------- | ---------------------------------- |
| 1         | 4 of 6          | 3 of 4 (+1 by truncation accident) |
| 2         | 5 of 6          | 4 of 4                             |
| 3         | 6 of 6          | 4 of 4                             |

## Behavioural prompts

Selection is necessary but not sufficient — these check that the skill changes the _answer_, which
is the only thing it is judged on. Each has a wrong answer a capable agent gives without the skill.

7. **"Consumer loop: `while (true) { var item = queue.poll(); if (item == null) break; handle(item); }`
   over a `LinkedTransferQueue`. Our consumer sometimes exits with items still queued."**
   Without the skill: "add a timeout to `poll`" or "the queue is empty, check the producer." With
   it: on JDK 21–25 `poll()` can return null on a non-empty queue (JDK-8371740, fixed in 26, no
   backport), so `null` does not mean drained on either current LTS.

8. **"`semaphore.acquire(); doWork(); semaphore.release();` — we see 12 concurrent calls against a
   `Semaphore(8)`."**
   Without the skill: "the semaphore is broken" or a hunt for a second semaphore instance. With it:
   `Semaphore` has no ownership, so a `release()` on a path that never acquired is legal and
   silently raises the limit permanently — look for the second release site, not the missing one.
   The `doWork()` throwing past the release is the other half.

9. **"Retry loop: `while (!done) { cond.await(5, SECONDS); }` — the caller reports a five-second
   timeout occasionally taking minutes."**
   Without the skill: "the predicate is wrong" or "raise the timeout." With it: re-passing the
   original timeout turns N wakeups into N × timeout; carry the remaining time with
   `nanosRemaining = cond.awaitNanos(nanosRemaining)`.
