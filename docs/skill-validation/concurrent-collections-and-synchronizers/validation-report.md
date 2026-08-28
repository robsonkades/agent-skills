# Validation report — `concurrent-collections-and-synchronizers`

**Current gate result (iteration 3): PASS.** Zero BLOCKER, zero MAJOR. Iteration 3 found
**0 BLOCKER, 0 MAJOR, 0 MINOR, 0 NIT** — every iteration-2 finding is closed and no new one was
raised.

| Iteration | Date       | Gate     | BLOCKER | MAJOR | MINOR | NIT |
| --------- | ---------- | -------- | ------- | ----- | ----- | --- |
| 1         | 2026-08-28 | FAIL     | 2       | 5     | 11    | 4   |
| 2         | 2026-08-28 | FAIL     | 0       | 2     | 4     | 3   |
| 3         | 2026-08-28 | **PASS** | 0       | 0     | 0     | 0   |

**Release record — residual items: none against the skill.** One packaging step is outstanding
and is **not** a finding against this package: `registry/skills.yaml` cannot be regenerated
because an unrelated, in-flight directory breaks the index builder (see "External blocker"
below). Iteration 2's N1 is therefore recorded as _blocked-external_ rather than open, per the
coordinator's instruction, and the gate is judged on the skill itself. n4 (a hedged secondary
source at `references/locks.md:243`) remains open by agreement from iteration 1 and needs no
action.

---

# Iteration 3

**Iteration 3.** Validated 2026-08-28 by the same independent validator (did not author the
skill).

**Gate result: PASS.** **0 BLOCKER, 0 MAJOR, 0 MINOR, 0 NIT.**

Scope, as directed: the deltas plus a closure check, not a repeat of the full API reality sweep —
nothing read in this pass gave me cause to reopen it. Everything below was verified by execution
on **Temurin 25.0.3+9**, not by reading the new prose. Specifically: all **18** Java fences were
re-extracted programmatically from the current post-`prettier` files and compiled with
`javac --release 25 -Xlint:all`; the rewritten `transfer` was stress-tested and probed for the
hole having moved rather than closed; the three claims in and around the rewritten `Memoizer`
paragraphs were each run, including a differential probe of the two-argument `remove`; the 1024
cut was re-measured on the new description; and two extra adversarial probes were run on samples
I had never executed, to make sure "no new findings" was earned rather than assumed.

## Iteration-2 findings — closure status

| #      | Sev   | Finding                                      | Status                                                                                                                |
| ------ | ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **N1** | MAJOR | `registry/skills.yaml` stale                 | **BLOCKED — EXTERNAL.** Reproduced; cause is another agent's in-flight package. Not held against the gate. See below. |
| **N2** | MAJOR | counterfactual cancellation sentence         | **CLOSED.** Rewrite matches the executed behaviour clause for clause; the two adjacent paragraphs verified too.       |
| **N3** | MINOR | `collections.md` routing under-inclusive     | **CLOSED.** `SKILL.md:180-181`.                                                                                       |
| **N4** | MINOR | `transfer` swallows an interrupted caller    | **CLOSED.** Now `void` + one cancel seam; re-stressed and probed.                                                     |
| **N5** | MINOR | dangling "that `LinkedTransferQueue` bug"    | **CLOSED.** `SKILL.md:102-104`.                                                                                       |
| **N6** | MINOR | copy-on-write and LTQ invisible at selection | **CLOSED.** Both now inside the 1024 cut; measured below.                                                             |
| **N7** | NIT   | `remainingCapacity()` "reports empty"        | **CLOSED.** `queues.md:60`.                                                                                           |
| **N8** | NIT   | reference coupled to the body by ordinal     | **CLOSED.** `locks.md:263-264`.                                                                                       |
| **N9** | NIT   | memoiser referred to by a name it lacked     | **CLOSED.** `collections.md:106`.                                                                                     |

---

## N2 — closed, and the paragraphs around it verified rather than trusted

The coordinator asked me to check the neighbouring paragraphs for "the same class of
counterfactual you and he each shipped once — a plausible justification nobody ran." Three
claims, three runs.

**The rewrite itself** (`references/collections.md:146-151`):

> An interrupted first caller is the same story by a different route, and not the route the name
> suggests: the `Callable` throws `InterruptedException`, `FutureTask` records that as an
> _exceptional_ completion, `f.get()` throws `ExecutionException`, and the entry is evicted, so a
> later caller reloads cleanly. Nothing in this class ever calls `cancel()`, so the
> `CancellationException` arm is dead here — keep it anyway, because it goes live the moment a
> caller can cancel the future.

Every clause matches the iteration-2 measurement
(`first-caller threw java.util.concurrent.ExecutionException  cacheSize=0`, then
`later caller -> reloaded`). The false claim is gone and the dead-arm point — which is the real
reason the `catch` has two types — is now stated correctly.

**The paragraph above** (`:138-144`), which the author says he corrected. It now makes two
separable claims, one about the code _without_ the removal and one _with_ it. Both run:

```
A. call 1 -> EE blip
A. call 2 -> EE blip
A. call 3 -> EE blip
A. loader invocations = 1  (claim: once)
B. call 1 -> EE blip
B. call 2 -> v2
B. call 3 -> v2
B. loader invocations = 2  (claim: twice; 2nd returns value; 3rd from cache)
```

"Without it … the loader is invoked **once** and every subsequent caller re-throws the same cached
`ExecutionException`" ✓. "With the removal in place … the same loader is invoked twice, the second
call returns the value, and the third serves it from cache — evicting the failure did not turn the
memoiser into a pass-through" ✓, exactly. The previous ambiguity — a sentence that read as though
one invocation were the _fixed_ behaviour — is resolved by splitting the two cases.

**The two-argument `remove` paragraph** (`:153-156`) is the one that most looked like an unrun
justification, so I built a differential probe: the same interleaving against the shipped
two-argument form and against a one-argument variant. The interleaving is the one the text
describes — a caller's load fails, a concurrent refresh installs a new future, then the failed
caller cleans up:

```
C. two-arg: cache holds FRESH - refresh survived
C. one-arg: cache EMPTY - the fresh entry was clobbered
```

The claim holds and is load-bearing: with `remove(key)` the fresh entry is destroyed. The
companion clause — "two callers sharing one future both see the same `ExecutionException`, and the
second removal is a no-op rather than a clobber" — was measured in iteration 2
(`loaderCalls=1 results=[EE:boom, EE:boom] cacheSize=0`) and still holds.

Nothing in this region is asserted without evidence any more.

## N4 — closed, and the hole did not move

`references/locks.md:101-117` is now `void`, with a single cancel seam:

```java
static void transfer(Account a, Account b, long amount) throws InterruptedException {
    for (;;) {
        if (Thread.interrupted()) throw new InterruptedException();   // one cancel seam
        …
```

Compiled clean under `-Xlint:all`. Three runs:

```
1. finished=true total preserved=true (a=1000000, b=1000000)
2. threw InterruptedException; transfer performed=false; interrupt status cleared by Thread.interrupted()=true
3. mid-flight interrupt -> InterruptedException; A held after=false; transfer performed=false
3. worker alive after join = false
```

1. The lesson is intact — six threads, 2000 opposed transfers each, no deadlock, total preserved.
   That is exactly the claim `locks.md:122-123` now makes, so the reference's own stated evidence
   reproduces.
2. **The hole is closed at the point it existed.** An already-interrupted caller now throws
   `InterruptedException` instead of returning a `false` indistinguishable from contention.
   `Thread.interrupted()` clears the flag before the throw, which is the conventional contract for
   a method that throws `InterruptedException` and is consistent with what `tryLock(timeout)` and
   `Thread.sleep` do in the same loop.
3. **The hole did not move to mid-flight.** Interrupted while retrying against a permanently held
   B, the method throws, lock A is **not** left held (`A held after=false`), no partial transfer
   occurred, and the thread terminates. The `finally` blocks carry the unwind correctly.

`locks.md:125-131` also explains _why_ it is `void`, naming the exact defect and offering the
attempt-budget alternative. That is the better outcome — the reader learns the seam, not just the
shape.

## N3 — closed; routing now reaches the file's sections

`SKILL.md:180-181`:

> Read before putting anything inside a `compute*` function, **and when choosing between CHM, a
> synchronized wrapper, copy-on-write and a skip list.**

Checked against the file's actual headings:

| `collections.md` section                                       | Line | Reached                                                                              |
| -------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------ |
| What the atomic methods actually promise                       | 6    | yes — first clause                                                                   |
| The bin lock, and how little of a recursive update is detected | 43   | yes — first clause                                                                   |
| A loader that can block: the failure-evicting memoiser         | 106  | yes — first clause                                                                   |
| Views, counts and iteration                                    | 161  | yes — `keySet` variants and the CHM/skip-list comparison sit under the second clause |
| Synchronized wrappers: the three surviving reasons             | 192  | **yes — was stranded**                                                               |
| Copy-on-write                                                  | 229  | **yes — was stranded**                                                               |
| Skip lists                                                     | 259  | **yes — was stranded**, and this is where M2's fix lives                             |

The three sections the narrowed condition had orphaned are reachable again. The only paragraph
not reached by either clause is the bulk-operations/`parallelismThreshold` note inside "Views,
counts and iteration" — it is one paragraph, it is advertised in the contents list at
`SKILL.md:179` ("bulk ops"), and a reader who opens the file for either stated reason will pass
it. Not worth a finding.

## N6 — closed; measured at the cut

`agent-skills validate` on the current package — same single lint, no new problem:

```
concurrent-collections-and-synchronizers@1.0.0
  6 files

  ! description  Description is 1373 characters; Claude Code shows roughly the first 1024
      Move the detail into the SKILL.md body
      claude.description.long

✓ Valid, with 1 warning
```

Truncated at 1024, this is what the selector sees:

> Choosing between the members of java.util.concurrent once the family is settled, and the
> parameter that makes it correct: which BlockingQueue and which of its four insert and remove
> forms, which ConcurrentHashMap atomic replaces a compound action, **copy-on-write's write
> cost**, latch versus barrier versus phaser versus semaphore, the Condition await loop, and
> ReentrantLock versus ReentrantReadWriteLock versus StampedLock on capability. **Does not cover
> the thread-safety contract (java-thread-safety-contracts), executor lifecycle
> (executors-and-task-lifecycle), limit sizing (concurrency-limiting-and-bulkheads), CAS loops
> (lock-free-patterns), monitor contention (lock-inflation), pinning diagnosis
> (virtual-threads-internals) or happens-before (java-memory-model).** Use when computeIfAbsent
> loads from a database, when IllegalStateException "Recursive update" is thrown, when size() on a
> **ConcurrentLinkedQueue or LinkedTransferQueue** is exported as a gauge, when new
> LinkedBlockingQueue<>() or queue.add(task) appears in a p

Everything the author claimed is inside the cut, confirmed item by item: `copy-on-write`,
`ConcurrentLinkedQueue`, `LinkedTransferQueue`, `Recursive update`, `computeIfAbsent`,
`new LinkedBlockingQueue<>()`, and **all seven** exclusions.

Truncated tail, 349 characters:

> …roducer, when an offer() boolean is discarded, when a thread is parked in CountDownLatch$Sync or
> every worker sits in CyclicBarrier.dowait, when await() sits under an if, when a read lock is
> upgraded to a write lock, when a CopyOnWriteArrayList holds request-scoped data, or when
> LinkedTransferQueue.poll() returns null on a queue that is not empty.

**Zero orphans now** — every one of the six truncated triggers has a proxy in the visible half:
`offer()` boolean → "four insert and remove forms"; `CountDownLatch$Sync`/`CyclicBarrier.dowait` →
"latch versus barrier versus phaser versus semaphore"; `await()` under an `if` → "the Condition
await loop"; read-lock upgrade → the three-lock clause; `CopyOnWriteArrayList` →
"copy-on-write's write cost"; `LinkedTransferQueue.poll()` → `LinkedTransferQueue` in the gauge
trigger.

The author paid for this by reordering: the `size()` gauge trigger (which carries both queue
names) moved ahead of the `new LinkedBlockingQueue<>()` trigger, which pushed the `offer()`-boolean
trigger past the cut. That is a good trade — two subjects gained a visible signal, one literal
trigger lost its own wording but kept a strong proxy in the covers sentence.

## N5, N7, N8, N9 — closed

- **N5** `SKILL.md:102-104` now opens "`LinkedTransferQueue.poll()` can return null on a non-empty
  queue on JDK 21–25 (JDK-8371740, table above), so …". The pronoun is gone and the JBS number and
  a pointer to the table are in its place.
- **N7** `queues.md:60` — "all exist and all report a queue with nothing in it and no room in it
  (`remainingCapacity()` is `0`)". Accurate: measured `size()=0`, `peek()=null`,
  `iterator().hasNext()=false`, `remainingCapacity()=0`.
- **N8** `locks.md:263-264` — "The rung that matters most is **`ReentrantLock` + one `Condition`
  per predicate**". Named, not numbered, and the phrase appears verbatim in the body ladder at
  `SKILL.md:148`. The ordinal coupling is gone.
- **N9** `collections.md:106` is now headed "A loader that can block: the failure-evicting
  memoiser", matching the name used at `SKILL.md:108` and `:179`.

---

## Ruling: `monitor contention (lock-inflation)` in the exclusion list — **it earns its ~38 characters. Keep it.**

The author read my iteration-2 "stop" as "stop compressing" rather than "add nothing", and on the
record that is the correct reading: my dispute-2 ruling said, verbatim, "Spend ~40 of the
remaining headroom on N6 instead … **and, if there is room, add lock-inflation to the exclusion
list.** That closes the last real routing gap." There was room. He did both.

On the merits, three tests:

1. **Is there real overlap to disclaim?** Yes, at body level. `lock-inflation`'s own description
   triggers on "threads sit in BLOCKED on a synchronized block" and "`jdk.JavaMonitorEnter`
   dominates a recording". This skill has a whole `synchronized`-vs-`ReentrantLock` capability
   table (`locks.md:33-47`), a `jdk.JavaMonitorEnter` row in it, a `synchronized` choice rule at
   `SKILL.md:137-139`, and `jdk.JavaMonitorEnter` again in Verification at `:166`. Iteration 2's
   near-miss B ("40 threads BLOCKED on one `synchronized` block") passed only because the word
   `synchronized` happened not to appear in the visible description — clean by accident. It is now
   clean by statement.
2. **Does the house standard want it?** `skill-engineering/SKILL.md:108-109` requires the boundary
   to name the nearest neighbouring skill, and `references/resource-design.md:95-96` requires two
   skills that could match the same request to exclude each other by name. `lock-inflation` was
   the last concurrency neighbour with a genuine claim on this skill's surface and no mention.
3. **Did it cost anything measurable?** No. 1320 → 1373 characters, and the cut measurement above
   shows all seven exclusions and all six named subjects still inside the visible 1024, with every
   truncated trigger retaining a proxy. Measured over all 235 skills today, the description ranks
   13th; it was 16th at 1320. Same band, no behaviour change.

It buys a real routing guarantee for nothing. Keep it.

---

## External blocker — the packaging step, not the skill

Reproduced exactly as reported:

```
$ node scripts/build-registry-index.mjs --check
AgentSkillsError: C:\git\agent-skills\skills\architecture-characteristics is not a skill package: no skill.yaml
    at loadPackageFromDirectory (…/packages/core/dist/application/package-loader.js:27:15)
    at async …/scripts/build-registry-index.mjs:38:19 {
  code: 'ASK_INVALID_PACKAGE',
```

The builder loads every directory under `skills/` with `strict: true` before it writes anything,
so one incomplete package aborts the whole index. I confirmed the cause is singular:

```
$ for d in skills/*/; do [ -f "$d/skill.yaml" ] || echo "MISSING: $d"; done
  MISSING: skills/architecture-characteristics/

$ ls -la skills/architecture-characteristics/
-rw-r--r-- 1 robso 23179 Aug 28 00:43 SKILL.md          # created 00:39, still being written
```

Exactly one directory of 235 lacks a manifest, it is not this package, and it is being authored by
another session right now. Not touching it is the right call.

Consequence for this package, stated precisely so the release record is unambiguous:

```
computed now : sha256-P8Hpi90/mI0/od/rI//9HTFpvdUKD37/SKrPU5yIjLk=
registry says: sha256-+NeGYUvahmpUR07CXiOfuEW2TuUKDnvN3c16Br2NcXc=
```

The registry entry has moved since iteration 2 (`gEQaKx…` → `+NeGYUva…`), so it was rebuilt at some
point; the `prettier --write` pass and the iteration-3 edits have moved the package on again. The
index therefore advertises a stale description and a stale hash, and `npm run registry:check`
fails. **This is a one-command fix (`npm run registry:build`) that becomes available the moment
`skills/architecture-characteristics` gains a `skill.yaml`.** Nothing in this package needs to
change for it. Recorded as an outstanding packaging step, not as a finding, and not held against
the gate.

---

## What was re-run, and what it showed

**All 18 Java fences, re-extracted from the post-`prettier` files.** I did not reuse iteration-2
transcriptions; a script pulled every ` ```java ` block out of the five current files and wrote
them to disk, so the compile is against exactly what ships.

```
extracted 18 java fences from the CURRENT (post-prettier) files
…
=== javac exit=0 ===
classes produced: 11
```

Clean under `-Xlint:all`, `java.base` only. One note, not a finding: `locks.md:56` (`class X`) is
copied verbatim from the `ReentrantLock` javadoc and, like the javadoc, carries no `import` —
the file's own preamble (`locks.md:3-4`) establishes the setting, so I supplied
`java.util.concurrent.locks.ReentrantLock`, as in both previous iterations. `prettier` did not
disturb any fence body.

**Two adversarial probes on samples I had never executed**, so that "no new findings" is backed by
work:

```
Frequencies: expected 800000, got 800000 -> no lost updates
compound containsKey+put: 28 duplicate initialisations observed (the table's stated symptom)
```

- `collections.md:18`'s `Frequencies` is genuinely safe as claimed — 16 threads × 50 000
  increments, exact count, no lost updates, so "`computeIfAbsent` here is safe because
  `new LongAdder()` allocates and returns" holds under contention.
- The substitution table's lead sentence (`SKILL.md:75-77`, "duplicate initialisation … invisible
  in tests and load-dependent in production") is now executed evidence: the forbidden
  `containsKey`+`put` shape produced **28** duplicate initialisations under the same contention.

**Consistency and measurement.** `name` matches the directory in both files; the frontmatter
declares no `version`; the two descriptions are byte-identical after whitespace folding (1373 each).
Body is 172 lines (the author's 171 is an off-by-one in counting, immaterial).

**Corpus context — measured 2026-08-28, with `skills/` at 235** (it grew from 207 during this
session through unrelated parallel work, so earlier rankings in this report were taken against
smaller populations and are not comparable):

```
 desc median 979 | >1024: 69 | target 1373 rank 13 of 235
 body median  96 | target 172 lines, rank 7 of 235
 longest bodies: 223 architecture-characteristics | 188 gof-memento | 184 architecture-trade-off-analysis
               | 182 gof-strategy | 180 gof-visitor | 176 gof-state
```

Both dispute rulings from iteration 2 stand and are, if anything, better supported: the body is
7th of 235 rather than 1st of 234, and the description sits in a band shared by 69 skills.

## Could not verify (unchanged)

Carried forward from iteration 2; each is hedged in the skill itself, which is the right outcome:
the absent backport row for JDK-8371740 (`queues.md:152-153`), the JDK 26 fix mechanism
(`queues.md:155`, labelled inference), the exact 8u for JDK-8062841 (`collections.md:94-96`), the
`StampedLock` writer-starvation magnitude (`locks.md:243`, n4, open by agreement), and Spring
Boot's default task-executor queue capacity (`queues.md:103-104`, outside a `java.base`-only
review).

---

# Iteration 2

**Iteration 2.** Validated 2026-08-28 by the same independent validator (did not author the
skill).

**Gate result: FAIL.** **0 BLOCKER, 2 MAJOR, 4 MINOR, 3 NIT.**

Method: the full checklist was re-run, not just the deltas. Sources read again from
`$JAVA_HOME/lib/src.zip` of **Temurin 25.0.3+9**. Every code sample in the four references —
changed and unchanged, fifteen files — was extracted and compiled with
`javac --release 25 -Xlint:all`, `java.base` only, and every claim with observable behaviour was
executed on 25.0.3. Specifically: a new harness reproduces all four labelled rows of the
recursion block in `collections.md` plus a fifth case that isolates the `merge` point; the new
`Memoizer` was run against a transient failure, a concurrent waiter and an interrupted first
caller; the new `tryLock` transfer recipe was stress-tested with six threads making 12 000
opposed transfers; the description was truncated at 1024 characters and the surviving text
measured; and both disputes were adjudicated against fresh corpus statistics over all 234
skills.

## Iteration-1 findings — closure status

Every one verified against the edited files and, where behavioural, re-executed.

| #      | Finding                                   | Status                | Evidence of closure                                                                                                                                                                                             |
| ------ | ----------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** | "same bin throws"                         | **CLOSED**            | `SKILL.md:108-112` and `collections.md:62-85` now state the two structural arms. Re-run below reproduces all four printed rows exactly, and a fifth case proves the `merge` claim.                              |
| **B2** | `Memoizer` caches failures                | **CLOSED**            | `collections.md:128-133` adds the two-arg `remove`. Executed: loader re-invoked after a transient failure, concurrent waiter unharmed, cache emptied.                                                           |
| **M1** | description truncated past its exclusions | **CLOSED**            | Reordered to covers → _Does not cover_ → _Use when_; at 1320 chars **all six exclusions are inside the visible 1024**. Measured below. Residual gap is N6 (MINOR).                                              |
| **M2** | CSLSet javadoc "removed in 24"            | **CLOSED**            | `collections.md:275-278` now says the method javadoc only, and that the class warning survives on 25.0.3 and in mainline. Matches the source.                                                                   |
| **M3** | body↔reference duplication                | **CLOSED**            | Substitution table given one home (body `:73-86`), and `collections.md:8` says so explicitly. The split is now rule-in-body / mechanism-in-reference. Body 227 → 188 lines total. See the dispute-1 ruling.     |
| **M4** | six-way `tracePinnedThreads` collision    | **CLOSED**            | The trigger clause is deleted from the description, not merely moved. Body `:136-138` keeps one capability clause and routes diagnosis to virtual-threads-internals; `locks.md:15-16` hands it over explicitly. |
| **M5** | Purpose disclaims what the body restates  | **CLOSED**            | `SKILL.md:28-30` now takes the coherent option: "The _rule_ … belongs to java-thread-safety-contracts; the mechanism it implies is here", and the table is owned here.                                          |
| mi1    | `$Sync` vs `$NonfairSync`                 | **CLOSED**            | `locks.md:150-153`, and it goes further than asked — it names why a runbook grep misses. Matches my executed `LockInfo` output.                                                                                 |
| mi2    | `merge` `@throws`                         | **CLOSED**            | `collections.md:99-101`.                                                                                                                                                                                        |
| mi3    | negative `size()`                         | **CLOSED**            | `SKILL.md:98-101` and `collections.md:154-157` both distinguish the striped sum from the clamped `size()`.                                                                                                      |
| mi4    | semaphore fairness gloss                  | **CLOSED**            | `synchronizers-and-conditions.md:95-102` quotes rather than rationalises, states that neither javadoc explains the difference, and routes the decision to concurrency-limiting-and-bulkheads.                   |
| mi5    | `tryLock` recipe without try/finally      | **CLOSED**            | `locks.md:92-119` is now a complete, compiling, deadlock-free sample. Stress-tested below. One residual MINOR (N4).                                                                                             |
| mi6    | AOS vs AQS attribution                    | **CLOSED**            | `locks.md:261-264` attributes it to AQS's class javadoc. Quote verbatim at `AbstractQueuedSynchronizer.java:133-135`.                                                                                           |
| mi7    | `getQueueLength()` under queue metrics    | **CLOSED**            | `SKILL.md:171-172` — "a lock method — threads waiting to acquire, not queue depth".                                                                                                                             |
| mi8    | JBS numbers diverging                     | **CLOSED**            | Body drops the number; `locks.md:178` keeps both. One home.                                                                                                                                                     |
| mi9    | unattributed LTQ mechanism                | **CLOSED**            | `queues.md:155` — "_Inference, not a cited changeset:_", and `:152-153` hedges the backport as "absence of evidence, not evidence of absence".                                                                  |
| mi10   | ArchUnit rule reaching into executors     | **CLOSED**            | `SKILL.md:162-163` hands both halves away by name.                                                                                                                                                              |
| mi11   | poison-pill put-back                      | **CLOSED**            | `queues.md:46-51` names both costs and offers `offer(POISON)`.                                                                                                                                                  |
| n1     | "no peek, no iteration"                   | **CLOSED**            | `SKILL.md:53`, `queues.md:60`. Small new imprecision → N7.                                                                                                                                                      |
| n2     | `isEmpty()` O(1)                          | **CLOSED**            | `queues.md:221-222` — "amortised O(1) … though `first()` does walk past self-linked and already-matched nodes".                                                                                                 |
| n3     | AQS CLH history                           | **CLOSED**            | Deleted. `grep "waitStatus\|jdk-14\|CLH" references/locks.md` → no match.                                                                                                                                       |
| n4     | Kabutz secondary source                   | **open by agreement** | `locks.md:235` unchanged; it was correctly hedged and I did not ask for a change.                                                                                                                               |

---

## MAJOR

### N1. `registry/skills.yaml` is stale — it still ships the iteration-1 description and hash

`CLAUDE.md` is explicit: "Package integrity is a hash over file **contents**, so **any edit under
`skills/` changes the integrity** … After touching `skills/`: `npm run registry:build`.
`npm run verify` fails if you forget."

**Evidence.** Recomputing the integrity the way `scripts/build-registry-index.mjs` does, with the
repo's own `computePackageIntegrity` / `NodeFileSystem` / `NodeHasher`:

```
name     : concurrent-collections-and-synchronizers | version: 1.0.0
integrity: sha256-CZPhkcVUJG7hmPzKoue/89vnScGgepXZxdRCy8AwRh4=
```

`registry/skills.yaml` line 642 still says:

```
        integrity: sha256-gEQaKxDXZOgUgKrNAoKaLZFzkCL4+tSYmNqX0mIZT08=
```

— the iteration-1 hash, which I recomputed and confirmed as _current_ during iteration 1. The
registry `description` field is also still the **2069-character iteration-1 text**, beginning
"Picking the right member of java.util.concurrent…" and ending with the nine-exclusion tail.

**Why it matters.** This is not cosmetic. The registry index is what `search` and `info` render
and what an install verifies against, so the whole of M1's fix — the reordering that put the
exclusions in front of the truncation point — is invisible to every registry consumer, and an
install would fail integrity verification against the shipped package. It also fails
`npm run verify`, which this repo defines as the bar for "done". In iteration 1 I checked this
specifically and found the entry current; it regressed in iteration 2.

**Fix.** `npm run registry:build`, then confirm `npm run registry:check` no longer names this
package.

---

### N2. The cancellation sentence beside the `Memoizer` describes behaviour this code does not have — and it is my error, copied from iteration 1

`references/collections.md:142-144`:

> The cancellation path is identical — an interrupted first caller leaves a cancelled `Future`
> cached and every later caller gets `CancellationException` — which is why the `catch` covers
> both.

**Provenance first: this sentence is mine.** My iteration-1 report wrote "The cancellation path is
the same: an interrupted first caller leaves a cancelled `Future` cached, and every later caller
gets `CancellationException`", and I did not test it. The author copied it faithfully. It is
wrong.

**Evidence.** The sample's `FutureTask` is run synchronously by the first caller
(`task.run()`), and nothing in the class ever calls `f.cancel(…)`. Interrupting the first caller
therefore makes the `Callable` throw `InterruptedException`, which `FutureTask` records as an
_exceptional completion_, not a cancellation. Run on 25.0.3 against the verbatim sample, with a
loader that sleeps 60 s and a first caller interrupted after 300 ms:

```
4. [first-caller threw java.util.concurrent.ExecutionException]  cacheSize=0
4. later caller -> reloaded
```

`ExecutionException`, not `CancellationException`; the entry is **evicted, not cached**
(`cacheSize=0`); and the later caller reloads cleanly. Every clause of the sentence is inverted.
The `CancellationException` arm of the `catch` is in fact unreachable in this class.

**Why this is MAJOR and not BLOCKER.** The _code_ is correct and the surrounding advice is
correct — the extra catch arm is harmless defence that becomes live the moment anyone wires
cancellation in, so it should stay. Nobody's program gets worse. But the sentence is a factual
claim about JDK class behaviour, stated in the same paragraph as, and with the same confidence
as, genuinely executed evidence ("run on 25.0.3 … the loader is invoked **once**"). A reader who
believes it will hunt for a cancelled-future failure mode that this idiom cannot produce, and
will mis-diagnose the interrupted case when they meet it.

**Fix.** Replace the sentence with what actually happens:

> An interrupted first caller is the same story by a different route: the `Callable` throws
> `InterruptedException`, `FutureTask` completes _exceptionally_, `f.get()` throws
> `ExecutionException`, and the entry is evicted. Nothing here ever calls `cancel()`, so the
> `CancellationException` arm is dead in this class — keep it anyway, because it becomes live the
> moment a caller can cancel the future.

---

## MINOR

### N3. `collections.md`'s routing condition narrowed while the file kept its content — three sections are now stranded, including M2's fix

`SKILL.md:177-179`:

> [Concurrent collections](references/collections.md) — the bin lock, which recursions are
> detected and which are silent, the failure-evicting memoiser, `keySet` variants, bulk ops, **the
> wrapper decision, copy-on-write, skip lists**. **Read before putting anything inside a
> `compute*` function.**

Iteration 1's condition was "Read when choosing a shared map, set or list." The contents list
still advertises all seven sections; the _condition_ now fires for one of them.

**Evidence.** `collections.md` headings and what the condition reaches:

| Section                                                        | Line | Reached by "before putting anything inside a `compute*` function"? |
| -------------------------------------------------------------- | ---- | ------------------------------------------------------------------ |
| What the atomic methods actually promise                       | 6    | yes                                                                |
| The bin lock, and how little of a recursive update is detected | 43   | yes                                                                |
| A loader that can block                                        | 106  | yes                                                                |
| Views, counts and iteration                                    | 152  | partly                                                             |
| **Synchronized wrappers: the three surviving reasons**         | 183  | **no**                                                             |
| **Copy-on-write**                                              | 220  | **no**                                                             |
| **Skip lists**                                                 | 250  | **no**                                                             |

And the body carries no rule that would send a reader there instead:

```
$ grep -n -i "skiplist\|skip list\|synchronizedMap\|Hashtable\|LinkedHashMap\|null key" SKILL.md
113:- Iterators come in two kinds … (CHM, skip lists,
179:  decision, copy-on-write, skip lists. Read before putting anything inside a `compute*` function.
```

A parenthetical and the routing line itself. So an agent asked "should this be a
`ConcurrentSkipListMap`?" or "can I replace this `Collections.synchronizedMap` with a CHM?" gets
no body rule and a condition that does not fire — and the second question has a hard blocker
behind it, confirmed on 25.0.3:

```
CHM null key   : NPE          CSLM null key  : NPE
CHM null value : NPE          CSLM null value: NPE
synchronizedMap(HashMap) null key+value: accepted, {null=null}
```

M2's fix — the `ConcurrentSkipListSet` javadoc contradiction at `collections.md:275-278` — sits in
the stranded "Skip lists" section.

**Why MINOR and not MAJOR.** I nearly graded this MAJOR and then checked the description: the
"covers" sentence claims BlockingQueue selection, CHM atomics, coordinators, the `Condition` loop
and lock choice. It does **not** claim map-family selection. So the description and the routing
line agree with each other; only the reference over-delivers. Nothing promised is missing.

**Fix.** One line. `SKILL.md:179` → "Read before putting anything inside a `compute*` function, and
when choosing between CHM, a synchronized wrapper, copy-on-write and a skip list."

### N4. The new `tryLock` recipe silently drops the work for an already-interrupted caller, and its `false` return is otherwise unreachable

`references/locks.md:101-117`. The lesson it teaches is sound — stress-tested on 25.0.3, six
threads, 2000 opposed transfers each, both directions:

```
1. all threads finished within 120s = true; total preserved = true (a=1000000, b=1000000)
```

No deadlock, no lost money. But the loop guard is `while (!Thread.currentThread().isInterrupted())`
and every in-loop wait (`tryLock(50, MILLISECONDS)`, `Thread.sleep`) _throws_
`InterruptedException` and clears the flag, so the guard can only be false on the very first
evaluation:

```
2. already-interrupted caller -> returned false; transfer performed = false; interrupt status still set = true
```

A caller that arrives already interrupted gets `false` — indistinguishable from "the locks were
busy, retry later" — with the transfer silently not performed. In every other path the method
returns `true` or throws, so `return false` at the bottom means exactly one thing, and it is not
the thing a `boolean` return suggests.

**Fix.** Make the cancellation seam explicit and drop the dead branch:

```java
static void transfer(Account a, Account b, long amount) throws InterruptedException {
    for (;;) {
        if (Thread.interrupted()) throw new InterruptedException();
        …
    }
}
```

or keep the `boolean` and bound the retries with an attempt budget, so `false` means "gave up".
Either way the interrupted caller must not look like a busy lock.

### N5. "Because of that `LinkedTransferQueue` bug" has no antecedent in the Rules section

`SKILL.md:101-103`:

> - `size()` is a gauge … Never export `size()` on `ConcurrentLinkedQueue` or
>   `LinkedTransferQueue` — it traverses.
> - **Because of that `LinkedTransferQueue` bug**, `if (poll() == null) { /* drained */ }` is
>   incorrect on JDK 21–25 …

The nearest antecedent is "it traverses", which is a cost, not a bug. The actual bug — JDK-8371740 —
is stated 48 lines earlier, in the queue-selection table at `SKILL.md:54`, in a different section.
A reader working down the Rules list cannot resolve the pronoun. This is compression damage: in
iteration 1 the bug had its own bullet here.

**Fix.** Name it: "`LinkedTransferQueue.poll()` can return null on a non-empty queue on JDK 21–25
(JDK-8371740, table above), so `if (poll() == null) { /* drained */ }` is incorrect there …"

### N6. Two subjects have no signal at all inside the visible 1024

Falls out of the M1 re-measurement below: of the five triggers past the cut, three are still
carried by a topic phrase in the visible "covers" sentence (latch/barrier/phaser, the `Condition`
await loop, RRWL). Two are not — **copy-on-write** and **`LinkedTransferQueue`** appear nowhere in
the visible half, yet both have body rules (`SKILL.md:117-119`, `:102-103`) and the second is the
skill's most distinctive single fact.

**Fix.** ~40 characters, no cut needed: extend the covers sentence to "… which
`ConcurrentHashMap` atomic replaces a given compound action, copy-on-write's write cost, latch
versus barrier …" and change the visible `size()` trigger to name both queues:
"when `size()` on a `ConcurrentLinkedQueue` or `LinkedTransferQueue` is exported as a gauge".

---

## NIT

### N7. `remainingCapacity()` on a `SynchronousQueue` does not "report empty"

`references/queues.md:60` — "`peek()`, `iterator()`, `size()` and `remainingCapacity()` all exist
and all report empty". Measured: `remainingCapacity()` returns `0`, which reads as _full_, not
empty. The other three do report empty (`size()=0`, `peek()=null`, `iterator().hasNext()=false`).
Say "all exist and all report a queue with nothing in it and no room in it".

### N8. `locks.md` couples itself to the body by ordinal

`references/locks.md:253-255` — "The skill body carries the ladder … The step that matters most is
**the fourth**". Counted against `SKILL.md:146-147`, the fourth is indeed `ReentrantLock` + one
`Condition` per predicate, so it is correct today. It breaks silently if anyone reorders or
shortens the ladder. Name the step instead of numbering it.

### N9. The memoiser is referred to by a name it does not have

`SKILL.md:107` and `:178` call it "the failure-evicting memoiser"; the section is headed "A loader
that can block" (`collections.md:106`). Not a broken link — no anchors are used — but a reader
scanning headings will not find the phrase. Retitle the section, or point at the heading.

---

## Re-measurement: the description at 1024 characters

`agent-skills validate` on the edited package — no new problem, and the same single lint:

```
concurrent-collections-and-synchronizers@1.0.0
  6 files

  ! description  Description is 1320 characters; Claude Code shows roughly the first 1024
      Move the detail into the SKILL.md body
      claude.description.long

✓ Valid, with 1 warning
```

Cut at 1024, this is what the selector sees — **the whole "Does not cover" block is inside it**:

> Choosing between the members of java.util.concurrent once the family is settled, and the
> parameter that makes the choice correct: which BlockingQueue and which of its four insert and
> remove forms, which ConcurrentHashMap atomic replaces a given compound action, latch versus
> barrier versus phaser versus semaphore, the Condition await loop, and ReentrantLock versus
> ReentrantReadWriteLock versus StampedLock on capability. **Does not cover the thread-safety
> contract itself (java-thread-safety-contracts), executor lifecycle and rejection
> (executors-and-task-lifecycle), limit sizing (concurrency-limiting-and-bulkheads), CAS loops
> (lock-free-patterns), pinning diagnosis (virtual-threads-internals) or happens-before
> (java-memory-model).** Use when computeIfAbsent loads from a database, when
> IllegalStateException "Recursive update" is thrown, when new LinkedBlockingQueue<>() or
> queue.add(task) appears in a producer, when an offer() boolean is discarded, when size() on a
> ConcurrentLinkedQueue is exported as a gauge, when a

Truncated tail — 296 characters, five triggers:

> thread is parked in CountDownLatch$Sync or every worker sits in CyclicBarrier.dowait, when
> await() sits under an if, when a read lock is upgraded to a write lock, when a
> CopyOnWriteArrayList holds request-scoped data, or when LinkedTransferQueue.poll() returns null
> on a queue that is not empty.

Three of the five survive by proxy: `CountDownLatch$Sync`/`CyclicBarrier.dowait` is covered by
"latch versus barrier versus phaser versus semaphore"; `await()` under an `if` by "the Condition
await loop"; the read-lock upgrade by "ReentrantLock versus ReentrantReadWriteLock versus
StampedLock". **Two do not**: copy-on-write and `LinkedTransferQueue` are absent from the visible
half entirely — that is N6, and it costs ~40 characters to close.

M1's named failure is gone. The exclusions reach the selector.

---

## Trigger quality, re-run from the reordered description

Judged from the visible 1024 only.

**Six that must select this skill**

| #   | Prompt                                                                                       | Iter 1    | Iter 2                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Our cache does `map.computeIfAbsent(id, k -> repository.findById(k))` — is that a problem?" | Yes       | **Yes** — first trigger in the list.                                                                                                                                                         |
| 2   | "`IllegalStateException: Recursive update` out of `ConcurrentHashMap.computeIfAbsent`."      | Yes       | **Yes** — verbatim, unique.                                                                                                                                                                  |
| 3   | "Should the producer use `offer()`, `put()` or `add()`?"                                     | Yes       | **Yes** — "four insert and remove forms" plus the discarded-boolean trigger.                                                                                                                 |
| 4   | "N workers must meet at the end of every round — `CountDownLatch` or `CyclicBarrier`?"       | Yes       | **Yes** — via the covers clause; the symptom trigger is truncated but the topic phrase carries it.                                                                                           |
| 5   | "This service does `new LinkedBlockingQueue<>()` and hands it to a `ThreadPoolExecutor`."    | Ambiguous | **Yes — fixed.** The trigger and the executors-and-task-lifecycle exclusion are now both visible, so the selector can see where the line falls.                                              |
| 6   | "Swap this `ReentrantReadWriteLock` for a `StampedLock` in the hot read path?"               | Ambiguous | **Mostly yes.** "on capability" is now the visible discriminator. Residual: lock-inflation also owns `StampedLock` non-reentrancy and is the one neighbour the exclusion list does not name. |

**Four that must select a named neighbour**

| #   | Prompt                                                                | Should reach                             | Iter 1                      | Iter 2                                                                                                                |
| --- | --------------------------------------------------------------------- | ---------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A   | "Is this class thread-safe? Shared `HashMap` field, no docs."         | java-thread-safety-contracts             | Yes                         | **Yes, now by name** in the visible exclusions.                                                                       |
| B   | "40 threads BLOCKED on one `synchronized` block."                     | lock-inflation / concurrency-diagnostics | Yes                         | **Yes** — `synchronized` appears nowhere in the visible half. Still the only unnamed neighbour.                       |
| C   | "`Semaphore(8)` in front of payments — is 8 right?"                   | concurrency-limiting-and-bulkheads       | Ambiguous                   | **Yes — fixed.** "limit sizing (concurrency-limiting-and-bulkheads)" is visible.                                      |
| D   | "JAVA_OPTS still sets `-Djdk.tracePinnedThreads` and we get nothing." | virtual-threads-internals                | Yes, by truncation accident | **Yes, robustly.** The clause was deleted, not moved, and "pinning diagnosis (virtual-threads-internals)" is visible. |

Net: 5 of 6 positives clean (was 4), 4 of 4 near-misses clean and none by accident (was 3 + 1).
The one remaining recommendation is to add lock-inflation to the exclusion list when N6's ~40
characters are spent — it is the only concurrency neighbour with a genuine claim on a visible
topic.

---

## Verification of the two headline fixes

### B1 — the corrected recursion text, re-executed

The block printed at `collections.md:74-79` reproduces exactly, and a fifth case isolates the
`merge` claim at `collections.md:68-69` ("This is the **only** arm that can fire in `merge`;
`merge` has no `pred.next` check at all"):

```
bin of 1/17/33 in a 16-slot table: 1/1/1
A(label) nested computeIfAbsent, empty bin reserved -> java.lang.IllegalStateException: Recursive update
A'(shown) merge into a reserved bin   -> java.lang.IllegalStateException: Recursive update
B same-bin nested compute, both present -> NO THROW  {1=v, 17=changed}
C same-bin put during compute         -> NO THROW  {1=v, 17=new-same-bin}
D append to the list being walked     -> IllegalStateException: Recursive update
E outer MERGE, fn appends to same list -> NO THROW  {1=one, 17=seventeen, 33=z}
```

B and C match the map contents printed in the reference character for character. **E is the new
one**: the same shape as D — a function that appends to the very list the call is walking — but
with `merge` as the outer call. D throws, E does not. That is the `pred.next` asymmetry the
reference asserts, now confirmed behaviourally as well as from the source (`merge`'s linked-list
arm at `ConcurrentHashMap.java:2086-2091` does `pred.next = new Node<>(…)` with no check; only the
`f instanceof ReservationNode` arm at `:2117` throws). Row A is reproducible under both readings
of its label, so the label is accurate even though the case whose output is shown used an inner
`merge`.

### B2 — the corrected `Memoizer`, re-executed

Compiled verbatim from `collections.md:112-136` under `-Xlint:all`, clean. Three scenarios:

```
1. call 1 -> EE: transient downstream blip
1. call 2 -> loaded-on-attempt-2
1. call 3 -> loaded-on-attempt-2
1. loader invocations = 2, cache size = 1
2. loaderCalls=1 results=[EE:boom, EE:boom] cacheSize=0
3. re-load after eviction -> fresh-1
```

1. The transient failure is genuinely evicted and **the next call re-invokes the loader** (two
   invocations, not one); the third call serves the cached success, so the fix did not turn the
   memoiser into a pass-through.
2. **The concurrent waiter is not broken.** With one thread inside `task.run()` and a second
   blocked in `f.get()` on the same future, the loader still runs exactly once, both callers
   receive the same `ExecutionException`, and the entry is removed once — the two-arg
   `remove(key, f)` makes the second removal a no-op rather than clobbering a replacement, which
   is the point `collections.md:146-147` makes.
3. A fresh call after eviction reloads.

The one thing that did not verify is the prose beside it — N2.

---

## Regression sweep

Beyond N1–N9, I looked specifically for the four failure shapes the coordinator named.

**A hazard deleted rather than relocated — none found.** All three named bullets survive:

| Deleted from body                                                                          | Now lives at                                                                                                                               | Reachable?                                                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `Collections.synchronizedMap` — three reasons, null blocker, external `synchronized (map)` | `collections.md:183-218`                                                                                                                   | yes, but by a condition that does not fire → N3                                                    |
| Semaphore over-release                                                                     | `SKILL.md:69` (coordinator table), `SKILL.md:157` (assertion), `synchronizers-and-conditions.md:132-135`                                   | yes, three times                                                                                   |
| The three reasons the `while` loop is mandatory                                            | `synchronizers-and-conditions.md:174-184`; body `:127-129` keeps the rule and the "not the one that makes `if` unconditionally wrong" hook | yes — this one is _better_ than iteration 1: the body states the rule, the reference the mechanism |

Also checked and intact: the unbounded-queue symptom chain (`queues.md:106-116`), the
`setExclusiveOwnerThread` obligation (`locks.md:261-264`), the `Runtime.version()` guard
(`SKILL.md:173`, now only the `>= 26` one, consistent with routing pinning away).

**A reference no longer routed by an explicit condition — none.** All four References entries
carry a "Read when/before …" clause. One is under-inclusive (N3).

**Cross-links pointing at renamed or deleted sections — none broken.** `collections.md:8` ("The
substitution table lives in the skill body") resolves to `SKILL.md:73-86`; `collections.md:15`
("The body's last row — a hot counter as `CHM<K, LongAdder>`") resolves to the table's last row;
`locks.md:253-255` ("the fourth") resolves correctly against `SKILL.md:146-147` (fragile → N8);
`SKILL.md:107`/`:178` point at a section whose heading differs (→ N9, cosmetic). Every named
neighbour skill exists on disk: java-thread-safety-contracts, executors-and-task-lifecycle,
concurrency-limiting-and-bulkheads, lock-free-patterns, virtual-threads-internals,
java-memory-model, structured-concurrency, cancellation-and-interruption, littles-law-and-queueing,
cascading-failures, lock-inflation, architecture-testing.

**A claim that lost its version qualification — none.** Every version-bearing statement in the
compressed body still carries its version:

```
30:  Baseline **JDK 25 LTS**; version-sensitive claims say so.
54:  poll() may return null on a non-empty queue on JDK 21–25 (JDK-8371740, fixed in 26)
103: on JDK 21–25: the consumer idles or exits with items still queued
138: been a reason since JEP 491 (JDK 24)
142: 21** and Integer.MAX_VALUE on **JDK 25**
173: Runtime.version().feature() >= 26
```

The only workflow step deleted (iteration 1's step 5, "check version-sensitive claims against the
JDK actually deployed") is compensated by `SKILL.md:30` plus the inline versions above. Acceptable.

**Compilability — no regression.** All fifteen extracted samples compile with
`javac --release 25 -Xlint:all`, `java.base` only, exit 0: the two `collections.md` classes
(`Frequencies`, the new `Memoizer`), its two fragments, the four `queues.md` samples, the five
`synchronizers-and-conditions.md` samples, and the four `locks.md` samples including the new
`Account.transfer`.

---

## Rulings on the two disputes

### Dispute 1 — body at 169 lines versus my "~90". **I concede. Accept 169.**

The author's arithmetic is honest and I checked it: the three selection tables are
`SKILL.md:44-58`, `:60-71` and `:73-86` — 15 + 12 + 14 = **41 lines**, exactly as claimed. (The
rules are 17 bullets over `:88-148`, not 15, but that strengthens their case, not mine.)

My "~90" was computed in iteration 1 against a **two**-table body, before the author took M5's
option (a) and promoted the substitution table into the body as its single home — which is the
better of the two fixes I offered, and it costs 14 lines. The like-for-like target is therefore
~104, not 90.

Then I applied the house gate — "IF the guidance would be followed by a capable agent without the
skill THEN delete it" — to all 17 rules individually, and **I cannot name three that fail it.**
Each names a specific class, a specific method form or a specific version boundary, and each is
checkable against produced code: the unbounded default, the four insert forms, `size()` as a
gauge, the LTQ poll bug, the bin lock, structural detection, the two iterator kinds,
`writeRate × size`, acquire-before-`try`, `tryAcquire()` barging, `while` not `if`, `signal` vs
`signalAll`, the `awaitNanos` carry, capability-not-pinning, RRWL upgrade and cap, `StampedLock`,
the AQS ladder. Naming rules to cut in order to hit a line count I derived from a different
structure would be exactly the "checklist inflation" the same reference warns against.

The corpus also no longer supports my iteration-1 framing. Measured over all 234 skills just now:

```
body lines: median 96
  longest 6: 188 gof-memento | 184 architecture-trade-off-analysis | 182 gof-strategy
           | 180 gof-visitor | 176 gof-state | 170 concurrent-collections-and-synchronizers
```

It was **1st of 234** in iteration 1. It is now **6th**, inside an established band, at 1.8× median
for a skill that carries three decision tables. "Longest in the corpus" was my strongest argument
and it is gone.

**Ruling: accept 169. Zero rules to delete.** The one thing I still want from this area costs a
single line, not thirty — the N3 routing repair.

### Dispute 2 — description at 1320 versus my "~900". **Accept 1320. The residual warning is a corpus lint, not this skill's defect.**

The coordinator's measurement holds up. Independently, over all 234 skills:

```
description: median 979 | >1024: 68 (29%)
  target skill: 1320 -> rank 16 longest of 234
  longest 5: 1719 distributed-aggregation-and-barriers | 1656 distributed-transactions-and-sagas
           | 1563 kafka-consumers-in-java | 1543 streaming-pipeline-topologies
           | 1497 java-application-security-basics
```

`claude.description.long` fires for 29% of the corpus, so it is a threshold the repo has already
decided to live with, not a per-skill verdict.

More to the point, the warning's _text_ names a specific failure — "Claude Code shows roughly the
first 1024" — and I graded M1 on the consequence of that failure, which was that every exclusion
fell past the cut. **That consequence is measured and gone**: all six exclusions are inside the
visible 1024, and three of the five truncated triggers survive by proxy in the covers sentence.
The warning now fires on a description whose informative half is intact.

Cutting to 900 would cost about 420 more characters. There is nothing left to remove that is not
either an exclusion or a trigger, so the cut would have to come out of one of them — reintroducing
precisely the failure M1 named in order to satisfy the lint that named it. That is the wrong trade.

**Ruling: accept 1320.** Spend ~40 of the remaining headroom on N6 instead — pull copy-on-write
and `LinkedTransferQueue` into the visible half — and, if there is room, add lock-inflation to the
exclusion list. That closes the last real routing gap at a fraction of the cost of the cut.

---

## Could not verify (iteration 2)

Unchanged from iteration 1 except where the skill now hedges them itself, which is the right
outcome for each:

- **No backport of JDK-8371740.** `queues.md:152-153` now says "no backport row was found as of
  this writing (absence of evidence, not evidence of absence)". Honest.
- **The JDK 26 fix mechanism.** `queues.md:155` now labels it "_Inference, not a cited
  changeset:_". Honest.
- **The 8u backport of JDK-8062841.** `collections.md:94-96` now says "JBS shows fix version 9 and
  an intent to integrate to 8u … the exact 8u is unverified here". Honest.
- **`StampedLock` writer-starvation magnitude** (`locks.md:234-238`) — one author's harness,
  hedged by the skill, unverified by me (this is n4, left open by agreement).
- **Spring Boot's default task-executor queue capacity** (`queues.md:103-104`) — outside the
  `java.base`-only scope of this review.

---

# Iteration 1

**Iteration 1.** Validated 2026-08-28 by an independent validator (did not author the skill).

**Gate result: FAIL.** PASS requires zero BLOCKER and zero MAJOR. Found **2 BLOCKER, 5 MAJOR,
11 MINOR, 4 NIT**.

Method: `java.util.concurrent` and `java.util.concurrent.locks` were read from
`$JAVA_HOME/lib/src.zip` of **Temurin 25.0.3+9** (the JDK installed here), never from memory.
Every JBS issue was fetched from the JBS REST API (`bugs.openjdk.org/rest/api/2/issue/...`);
JEP 491 from `openjdk.org/jeps/491`. Every Java sample in `SKILL.md` (none — it has no code
blocks) and all fourteen samples across the four references were extracted into real files and
compiled with `javac --release 25 -Xlint:all`, `java.base` only. Where a claim had observable
behaviour it was **executed** on 25.0.3: the `LinkedTransferQueue` bug reproduces, the
`ReentrantReadWriteLock` cap, the `Semaphore` fairness split, the `ConcurrentHashMap` recursion
boundary, the `ThreadMXBean` blind spots and the `Memoizer` failure mode were all run. The
repo's own validator (`agent-skills validate`) and `build-registry-index.mjs` were run against
the package.

**What is solid.** All fourteen samples compile clean under `-Xlint:all`. Five of the six
load-bearing claims verified exactly, including the two most surprising ones — the
`LinkedTransferQueue.poll()` bug reproduced locally on 25.0.3, and the fair-`Semaphore`
`tryAcquire()` / `tryAcquire(0, unit)` split proved deterministically. Every JBS number cited
(8371740, 8336462, 8352971, 8354016, 8278255, 8301341, 8338146, 8345052, 8062841, 8071667,
8256425, 8297605, 8186226) exists with the summary and fix version the skill claims. Every JEP
491 quotation is verbatim. Every JFR field name and threshold is right. The package's registry
integrity hash matches byte for byte.

---

## BLOCKER

### B1. "Recursive update into the same bin throws `IllegalStateException`" is false — same-bin recursion is routinely undetected

- `SKILL.md:121-124` — "Recursive update into the **same** bin throws
  `IllegalStateException("Recursive update")`; into a **different** bin it is undetected —
  silently non-atomic".
- `references/collections.md:56-59` — "1. **Recursive update into the same bin** →
  `IllegalStateException("Recursive update")`. Detection is bin-local".
- `references/collections.md:63` labels the _different-bin_ case "Source-derived from the JDK 25
  implementation" — so the author read the source, but drew the boundary in the wrong place.
- The research brief carries the identical error (`research-brief.md:67`, `:79`, `:1513-1514`).
  Skill and brief agree and both are wrong.

**Evidence.** Detection in JDK 25 is not bin-scoped; it is scoped to two specific structural
conditions. In `ConcurrentHashMap.java` (25.0.3 `src.zip`) `computeIfAbsent` throws only at
line 1758 (`if (pred.next != null)` — the function appended to the tail of the list this call
was traversing) and line 1779 (`else if (f instanceof ReservationNode)` — the function re-entered
a bin another `compute*` on this thread had reserved). `merge` (line 2117) throws **only** via
the `ReservationNode` arm; there is no `pred.next` check in `merge` at all.

Compiled and run on 25.0.3 (`Recursive.java`; keys 1, 17 and 33 all hash to bin 1 of a 16-slot
table, printed by the program):

```
A -> java.lang.IllegalStateException: Recursive update
B same-bin compute, both keys present: NO THROW {1=v, 17=changed}
C same-bin insert during compute: NO THROW {1=v, 17=new-same-bin}
D -> java.lang.IllegalStateException: Recursive update
bins: 1 1 1 (16-slot table)
```

Case **C** is decisive: `m3.put(1,"one")`, then
`m3.compute(1, (k,v) -> { m3.put(17, "new-same-bin"); return "v"; })` — a recursive insert into
the _same bin_, completing with no exception and leaving the operation silently non-atomic.
Case **B** is the same for a nested `compute`. A companion run
(`Behaviour.java`, `5b`/`5d`) shows a different-bin `put` and a same-key nested `merge` also
passing silently.

The javadoc is precise where the skill is not (`ConcurrentHashMap.java:1698-1700`):

```
* @throws IllegalStateException if the computation detectably
*         attempts a recursive update to this map that would
*         otherwise never complete
```

`detectably` is the whole content of the guarantee, and it is not the same-bin/different-bin
line.

**Why it matters.** The skill's other rules are safety rules; this one is a _detection_
guarantee, and it is wrong in the unsafe direction. An engineer who reads "same bin throws" will
conclude that a nested update they can show lands in the same bin is either caught at test time
or benign. Case C is exactly that shape and produces a silently non-atomic `compute` in
production, which is the failure the surrounding paragraph exists to prevent.

**Fix.** Replace both passages with the two real conditions:

- `SKILL.md:121-124` → "A recursive update is detected only when it is _structurally_
  detectable: `computeIfAbsent`/`compute` re-entering a bin this thread has already reserved (an
  empty bin mid-computation), or a function that appends to the tail of the very list
  `computeIfAbsent` is walking. Every other recursion — including into the same bin when the key
  already exists, and `merge` recursing into `merge` — completes silently and is non-atomic. Two
  threads recursing into each other's bins deadlock on the two bin monitors."
- `references/collections.md:56-68` → same, and change the section heading "the three outcomes
  of violating it" accordingly; keep the `merge` note but state that `merge` throws _only_ via
  the `ReservationNode` arm.

---

### B2. The recommended blocking-loader `Memoizer` caches a transient failure permanently

- `SKILL.md:119` — "For a blocking loader use `CHM<K, Future<V>>` + `putIfAbsent` instead."
- `references/collections.md:75-98`, the sample it routes to, annotated
  `// JCiP §5.6, still the right shape`:

```java
V get(K key, Callable<V> loader) throws InterruptedException, ExecutionException {
    Future<V> f = cache.get(key);
    if (f == null) {
        FutureTask<V> task = new FutureTask<>(loader);
        f = cache.putIfAbsent(key, task);
        if (f == null) { f = task; task.run(); }
    }
    return f.get();
}
```

**Evidence.** Compiled verbatim and run on 25.0.3 (`MemoTest.java`) with a loader that fails
once and then succeeds:

```
call 1 -> ExecutionException: java.lang.IllegalStateException: transient downstream blip
call 2 -> ExecutionException: java.lang.IllegalStateException: transient downstream blip
call 3 -> ExecutionException: java.lang.IllegalStateException: transient downstream blip
loader invocations = 1
```

The loader ran **once**. The failed `FutureTask` stays in the map forever; every subsequent
caller re-throws the same cached `ExecutionException` until the process restarts. The
cancellation path is the same: an interrupted first caller leaves a cancelled `Future` cached,
and every later caller gets `CancellationException`.

This is precisely the defect JCiP §5.6 (Listing 5.19) fixes, in the code the comment cites:

```java
} catch (CancellationException e) {
    cache.remove(arg, f);          // the line the sample drops
} catch (ExecutionException e) {
    throw launderThrowable(e.getCause());
}
```

**Why it matters.** This is the skill's prescribed replacement for `computeIfAbsent` with a
blocking loader, so it is the code an agent will write. A one-second downstream blip becomes a
permanently poisoned cache entry — a restart-only outage with no exception at the point of
damage, which is worse than the p99 cliff the rule was avoiding. It also contradicts the skill's
own standard: it cites a source and omits the correctness-critical half of it.

**Fix.** Add the removal to the sample and one sentence of prose:

```java
try {
    return f.get();
} catch (CancellationException | ExecutionException e) {
    cache.remove(key, f);          // never cache a failure
    throw e;
}
```

and state that `putIfAbsent`/`Future` memoisation must remove the entry on failure and
cancellation, or use a cache library (Caffeine's `AsyncLoadingCache` does this) rather than
hand-rolling it. Drop "still the right shape" or qualify it.

---

## MAJOR

### M1. Half the description — including the entire "Does not cover" block — never reaches the selector

- `SKILL.md:3-27` / `skill.yaml:5-28`. The description is **2069 characters**, the longest of
  all 234 skills in the repo (median 980; next longest, `distributed-aggregation-and-barriers`,
  1721).

**Evidence.** The repo's own Claude adapter enforces a threshold at
`packages/adapter-claude/src/index.ts:205-209`:

```ts
if (pkg.manifest.kind === 'skill' && pkg.manifest.description.length > 1024) {
```

Running the shipped validator:

```
$ node packages/cli/bin/agent-skills.mjs validate skills/concurrent-collections-and-synchronizers
  ! description  Description is 2069 characters; Claude Code shows roughly the first 1024
      Move the detail into the SKILL.md body
      claude.description.long
✓ Valid, with 1 warning
```

Cutting at 1024 chars, the text stops mid-word inside `CyclicBarrier.dowa|it`. Everything after
is invisible at selection time: the `availablePermits()` trend trigger, the `await()`-under-`if`
trigger, the read-lock-upgrade trigger, the `StampedLock`-with-callbacks trigger, the
`LinkedTransferQueue.poll()` trigger, the `-Djdk.tracePinnedThreads` trigger, **and every one of
the nine "Does not cover" exclusions** that name `java-thread-safety-contracts`,
`java-memory-model`, `lock-free-patterns`, `executors-and-task-lifecycle`,
`concurrency-limiting-and-bulkheads`, `littles-law-and-queueing`, `structured-concurrency` and
`concurrency-diagnostics`.

**Why it matters.** `skill-engineering/SKILL.md:69` states that name + description is the only
thing read at selection time, and its gate at line 108-109 requires the boundary to exclude an
adjacent topic _by name_. This skill has nine such exclusions and the selector sees none of them
— against twelve neighbouring concurrency skills that all plausibly match the same request.

**Fix.** Cut to roughly 900 characters. Keep the family-selection sentence, the six most
discriminating symptom triggers (`new LinkedBlockingQueue<>()`, a discarded `offer()` boolean,
`computeIfAbsent` doing I/O, `IllegalStateException "Recursive update"`, latch/barrier choice,
read-lock upgrade), and the three exclusions nearest in trigger space —
`java-thread-safety-contracts`, `executors-and-task-lifecycle`,
`concurrency-limiting-and-bulkheads`. Move the rest to the body's `## Purpose`.

---

### M2. "The stale O(n) warning was removed from `ConcurrentSkipListSet`'s javadoc in 24" — it is still there in JDK 25 and in mainline

- `SKILL.md:102-103` — "On `ConcurrentSkipListMap`/`Set` it is a cheap `LongAdder` estimate since
  **JDK 10** — the stale O(n) warning survived in the Set's javadoc until 24 (JDK-8336462)."
- `references/collections.md:217-218` — "The stale 'NOT a constant-time operation' warning was
  removed from `ConcurrentSkipListSet`'s javadoc only in JDK 24 (JDK-8336462)."
- Same error in the brief (`research-brief.md:415-416`).

**Evidence.** `ConcurrentSkipListSet.java` from the installed 25.0.3 `src.zip`, **class-level**
javadoc, lines 70-74:

```java
 * <p>Beware that, unlike in most collections, the {@code size}
 * method is <em>not</em> a constant-time operation. Because of the
 * asynchronous nature of these sets, determining the current number
 * of elements requires a traversal of the elements, and so may report
 * inaccurate results if this collection is modified during traversal.
```

It is still present in openjdk mainline today
(`raw.githubusercontent.com/openjdk/jdk/master/.../ConcurrentSkipListSet.java`, lines 70-74,
fetched during this review). What JDK-8336462 removed was the **method-level** copy on `size()`;
the JDK 23 file carried it at both line 69 and line 193, JDK 25 carries it only at line 70.

The rest of the paragraph is correct: `ConcurrentSkipListMap.java:343` declares
`private transient LongAdder adder`, `size()` (line 1396) reads `getAdderCount()`, and
`baseHead()` (line 399) is O(1) — so the operation genuinely is not a traversal.

**Why it matters.** The skill is telling a reader that a warning they can still see in the JDK 25
javadoc has been withdrawn. The next engineer opens the javadoc, finds the warning, and either
distrusts the skill or re-adds the `size()`-avoidance workaround the skill removed. A skill whose
whole selling point is version-accurate claims cannot get a version-scoped javadoc fact wrong.

**Fix.** `references/collections.md:216-218` →

> `size()` on both the map and the set has been a `LongAdder`-backed estimate since **JDK 10**
> (the `adder` field first appears at tag `jdk-10+46`). JDK-8336462 (fix version 24) removed the
> stale "NOT a constant-time operation" wording from `ConcurrentSkipListSet.size()`'s **method**
> javadoc, but the same warning survives in the **class** javadoc on JDK 25 and in mainline —
> read it as stale, not as current.

and shorten `SKILL.md:102-103` to "…since **JDK 10**; the class javadoc still warns otherwise —
see the reference."

---

### M3. Every rule in the body is restated in a reference — the house standard's "one home per fact", failed systematically

`skill-engineering/references/anti-patterns.md:29-30` — "**Duplicated knowledge.** The same rule
in the body and in a reference. They will diverge, and the reader will not know which is
current. One home per fact." `skill-engineering/SKILL.md:113` makes it a gate; and
`references/resource-design.md:103` — "No file restates something already in the body."

**Evidence.** Fourteen facts, each with two to five homes:

| Fact                                 | Body                                  | Reference                                 | Extra   |
| ------------------------------------ | ------------------------------------- | ----------------------------------------- | ------- |
| `LinkedTransferQueue.poll()` bug     | `SKILL.md:69`, `:104-108`, `:210-211` | `queues.md:57`, `:147-164`                | 5 homes |
| Bin lock on `compute*`/`merge`       | `SKILL.md:115-119`                    | `collections.md:49-68`, `:96-98`          |         |
| Recursive update                     | `SKILL.md:121-124`                    | `collections.md:56-68`                    |         |
| Copy-on-write `writeRate × size`     | `SKILL.md:131-133`                    | `collections.md:167-188`                  |         |
| Synchronized wrappers, three reasons | `SKILL.md:134-136`                    | `collections.md:130-152`                  |         |
| Acquire-before-`try` / JDK-8278255   | `SKILL.md:52-53`, `:137-143`          | `locks.md:59-87`                          | 3 homes |
| Semaphore over-release               | `SKILL.md:82`, `:144-146`, `:194-195` | `synchronizers-and-conditions.md:124-127` | 4 homes |
| `tryAcquire()` ignores fairness      | `SKILL.md:147-151`                    | `synchronizers-and-conditions.md:102-104` |         |
| `while` not `if` on a `Condition`    | `SKILL.md:152-156`                    | `synchronizers-and-conditions.md:166-176` |         |
| `signal` vs `signalAll`              | `SKILL.md:158-160`                    | `synchronizers-and-conditions.md:180-189` |         |
| `awaitNanos` re-wait arithmetic      | `SKILL.md:161-163`                    | `synchronizers-and-conditions.md:236-258` |         |
| JEP 491 / `tracePinnedThreads`       | `SKILL.md:54-56`, `:164-169`          | `locks.md:6-30`                           | 3 homes |
| RRWL upgrade + reader cap            | `SKILL.md:170-175`                    | `locks.md:110-156`                        |         |
| `StampedLock` constraints            | `SKILL.md:177-179`                    | `locks.md:158-210`                        |         |
| AQS-last ordering                    | `SKILL.md:180-184`                    | `locks.md:223-242`                        |         |
| Phaser ≤ 65535                       | `SKILL.md:81`                         | `synchronizers-and-conditions.md:80-82`   |         |
| Unbounded-queue symptom chain        | `SKILL.md:88-92`                      | `queues.md:90-112`                        |         |
| Queue implementation trade-offs      | `SKILL.md:64-73`                      | `queues.md:51-61`                         |         |

The consequence is measurable: at **227 lines / 2583 words**, `SKILL.md` is the longest body of
all 234 skills in this repo (median 110 lines). Every activation pays for it, and the references
then pay again.

**Why it matters.** The four references currently answer "it explains the same thing in more
words" — the exact test `resource-design.md:12` says a file must not fail. And divergence has
already started inside this skill: `SKILL.md:174` cites only JDK-8352971 for the reader cap
while `locks.md:148` cites JDK-8352971 **and** JDK-8354016 (see mi8).

**Fix.** Pick one home per row. The body should keep only what changes behaviour on _every_
activation — the two selection tables, the workflow, and the six rules that are decisions rather
than explanations (bound every queue; pick the insert form; `size()` is not control flow; replace
the compound action; `while` not `if`; acquire-before-`try`). Move mechanism, symptom chains and
version deltas wholly into the references and route by condition. That is roughly a 90-line body.

---

### M4. `-Djdk.tracePinnedThreads` / JEP 491 now has six homes and six competing triggers

- `SKILL.md:19-20` (description trigger) — "or when `-Djdk.tracePinnedThreads` or 'synchronized
  pins virtual threads' justifies a rewrite."
- `SKILL.md:164-169` and `locks.md:6-30` (content).

**Evidence.** The same fact and, worse, the same _trigger phrase_ already live in five existing
skills:

| Skill                               | Line                             | Text                                                                                                                                                                  |
| ----------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `virtual-threads-internals`         | `SKILL.md:9`, `:57-59`, `:65-67` | description trigger "when `-Djdk.tracePinnedThreads` appears in a runbook"; "removed in JDK 24: it is still accepted on the command line and does absolutely nothing" |
| `concurrency-diagnostics`           | `SKILL.md:11`, `:78-81`          | description trigger "when a runbook still says jstack or `-Djdk.tracePinnedThreads`"                                                                                  |
| `thread-sizing-and-virtual-threads` | `SKILL.md:11`, `:51-52`          | "The advice to swap it for `ReentrantLock` is obsolete, and `-Djdk.tracePinnedThreads` was **removed**"                                                               |
| `lock-inflation`                    | `SKILL.md:11`, `:79-82`          | description trigger "when someone proposes swapping synchronized for `ReentrantLock` to avoid virtual-thread pinning"                                                 |
| `java-thread-safety-contracts`      | `SKILL.md:103-106`               | "On JDK 24 and later (JEP 491) … the advice to replace `synchronized` with `ReentrantLock` for that reason is obsolete"                                               |

`resource-design.md:95-96` — "After splitting, each description must exclude the other by name.
Two skills that both plausibly match the same request will be selected unpredictably." Six do.
The new skill's own "Does not cover" list names none of `virtual-threads-internals`,
`thread-sizing-and-virtual-threads`, `lock-inflation` or `java-thread-safety-contracts` — and
would not be read at selection time anyway (M1).

There is no _contradiction_ — I checked all five against JEP 491 and all five are correct, and
all agree with this skill. The problem is purely routing.

**Fix.** Drop the `-Djdk.tracePinnedThreads` clause from the description entirely — this skill is
not where an engineer with a pinning question should land. Keep one sentence in `locks.md`
framed as a _choice_ rule ("choose on capability; pinning is not a reason on 24+ — see
`virtual-threads-internals` for the diagnosis") and delete the `SKILL.md:164-169` bullet's
diagnostic half (the JAVA_OPTS/runbook symptom, the `jdk.VirtualThreadPinned` field list), which
belongs to `virtual-threads-internals`.

---

### M5. The skill states a boundary in its Purpose and then crosses it three times in the same file

- `SKILL.md:40-42` — "it does not decide whether a class should be thread-safe, **does not
  restate that a thread-safe collection cannot make a compound action atomic**, and does not own
  lock scope or alien calls — java-thread-safety-contracts owns those."

**Evidence.** It restates it three times below that line:

- `SKILL.md:109-114` — "Replace each compound action on a `ConcurrentHashMap` with the single
  atomic method: `containsKey`+`put` → `putIfAbsent`; …"
- `references/collections.md:12-20` — the same mapping as a table, with `containsKey` then `put`
  → `putIfAbsent` as row one.
- `SKILL.md:188-190` — "**jcstress for the atomicity claim.** Two `@Actor`s racing
  `containsKey`+`put` against `putIfAbsent` on one key…"

And the neighbour already owns it, with the same canonical example
(`java-thread-safety-contracts/SKILL.md:88-91`):

> A thread-safe collection does not make a compound operation atomic. A `containsKey` followed by
> a `put` is a race no matter how concurrent the map is; `putIfAbsent`, `compute` and `merge`
> exist for this.

The same skill's line 82-87 already routes to "`ConcurrentHashMap` (with `compute`, `merge`,
`computeIfAbsent` for compound operations)" and already states "`wait`/`notify` … always needs a
loop around the condition predicate" — the germ of `SKILL.md:152-156`.

**Why it matters.** A stated exclusion that the body violates is worse than no exclusion: it
tells a reviewer the boundary was considered, and it tells an agent loading both skills that one
of them is stale. `skill-engineering`'s composability question ("Would this conflict with a
neighbouring skill if both were selected?") fails here.

**Fix.** Two choices, either is fine, but pick one. (a) Delete the false disclaimer at
`SKILL.md:41` and own the rewrite table explicitly, asking the neighbour to shorten its line
88-91 to a pointer. (b) Keep the disclaimer, delete `SKILL.md:109-114` and the jcstress bullet's
`containsKey`+`put` framing, and keep only the _new_ rows in `collections.md:12-20`
(`replace(k, old, new)`, `merge(k, 1L, Long::sum)`, `CHM<K, LongAdder>`), introduced as "beyond
the four the neighbour names". (b) is the smaller edit and matches the skill's stated altitude.

---

## MINOR

### mi1. The RRWL self-upgrade dump frame is `$NonfairSync`, not `$Sync`

`SKILL.md:171-173` and `references/locks.md:121-123` — "parked in
`ReentrantReadWriteLock$Sync.acquire` while holding a read lock". Run on 25.0.3
(`DeadlockVis.java`):

```
RRWL self-upgrade thread state = WAITING
findDeadlockedThreads()          = null
lockName  = java.util.concurrent.locks.ReentrantReadWriteLock$NonfairSync@4b1210ee
lockOwner = null
```

The rest of the claim is exactly right — `findDeadlockedThreads()` and
`findMonitorDeadlockedThreads()` both return `null`, and `lockOwner` is `null`. Someone grepping
a dump for `$Sync` on the default (non-fair) lock will match, but the concrete string a reader
will see is `ReentrantReadWriteLock$NonfairSync` (or `$FairSync`). Say so. (The same run confirms
the `StampedLock` claim at `SKILL.md:177-178`: self-deadlock, `findDeadlockedThreads() = null`,
top frame `jdk.internal.misc.Unsafe.park`.)

### mi2. `merge`'s `@throws` clause lists two things, not one

`references/collections.md:66-67` — "`merge`'s `@throws` clause in the JDK 25 javadoc lists only
`NullPointerException`". It lists `NullPointerException` **and** `RuntimeException or Error if
the remappingFunction does so` (`ConcurrentHashMap.java:2036-2040`). The point stands —
`IllegalStateException` is absent from `merge` and present on its three siblings — but "only
`NullPointerException`" is not what the file says.

### mi3. "the counter … can read transiently negative" reads as if `size()` can return a negative `int`

`SKILL.md:98-100` — "CHM's counter being a striped sum that can read transiently negative". True
of `sumCount()`; `size()` clamps (`ConcurrentHashMap.java`, `size()`: `(n < 0L) ? 0 : …`), and
`isEmpty()` is `sumCount() <= 0L` with the comment `// ignore transient negative values`
(line 932). `references/collections.md:102-104` gets this right; the body's compression loses it.
Reword to "…whose internal striped sum can read transiently negative, which is why `isEmpty()` is
`sumCount() <= 0L`".

### mi4. The semaphore-fairness rationalisation is the author's, and sits at an angle to `concurrency-limiting-and-bulkheads`

`SKILL.md:148-151` — "a semaphore guarding a long-held resource should generally be fair, a lock
guarding a short critical section should generally not". The two javadoc defaults are real and
quoted correctly (`Semaphore.java:295-303`, `ReentrantLock.java:56-68`); the _reason_ offered —
hold time as a property of the primitive — is not in either. `concurrency-limiting-and-bulkheads/SKILL.md:81-83`
keys the same decision on a different axis: "Default barging is right for uniform short work;
fairness earns its cost when hold times vary widely and tail latency matters." An agent holding
both will get "make resource semaphores fair" from one and "measure the variance first" from the
other. Attribute the javadoc guidance, drop the causal gloss, and route the sizing/fairness
decision to the neighbour by name.

### mi5. The `tryLock` deadlock-avoidance recipe is given without the `try`/`finally` the skill demands everywhere else

`references/locks.md:91-93` — "`tryLock()` — non-blocking, **ignores fairness** (barges). Correct
for lock-ordering deadlock avoidance (take A, `tryLock` B, release A and retry on failure)". This
is the one acquisition form where the release is _conditional on a boolean_, and it is the one
given as prose with no code, in a skill whose fourth workflow step is "Acquire as the last
statement before `try`; release as the first statement of `finally`". Add the four-line shape, or
drop the recipe.

### mi6. The `setExclusiveOwnerThread` quotation is from `AbstractQueuedSynchronizer`, not `AbstractOwnableSynchronizer`

`references/locks.md:237-239` — "Call `setExclusiveOwnerThread` (inherited from
`AbstractOwnableSynchronizer`) — the javadoc encourages it because 'this enables monitoring and
diagnostic tools to assist users in determining which threads hold locks'". The quoted sentence is
`AbstractQueuedSynchronizer.java:134`. `AbstractOwnableSynchronizer`'s own class javadoc says
something weaker: "subclasses and tools may use appropriately maintained values to help control
and monitor access and provide diagnostics" (lines 42-45). The advice is right; name the right
file.

### mi7. `getQueueLength()` is filed under queue metrics, but it is not a queue method

`SKILL.md:206-208` — a bullet about "bounded queue depth as a _fraction of capacity_",
"enqueue-to-dequeue latency", then "`getQueueLength()` is documented as monitoring only — a
gauge, never an `if`." `getQueueLength()` is on `ReentrantLock`, `ReentrantReadWriteLock`,
`Semaphore` and AQS — the count of threads _waiting to acquire_, not queue depth. (The "monitoring
system state, not for synchronization control" wording is verbatim, at
`ReentrantLock.java:691` and four places in `ReentrantReadWriteLock.java`.) Move it into the lock
bullet or say which class it belongs to.

### mi8. The body and the reference cite different issue numbers for the same fact

`SKILL.md:174` — "(JDK-8352971)". `references/locks.md:148` — "(JDK-8352971, JDK-8354016)". Both
exist and both are fix version 25 (8352971 "Increase maximum number of hold counts for
ReentrantReadWriteLock", 8354016 "Update ReentrantReadWriteLock documentation to reflect its new
max capacity"). This is M3's predicted divergence, already visible in the first release.

### mi9. The mechanism given for JDK-8371740 is unattributed and I could not confirm it

`references/queues.md:149-150` — "The JDK 25 code falls out of its match loop when an internal
compare-and-exchange loses, where mainline restarts." The **symptom** reproduces (see the
Verified section below) and the JBS record is exact, but this sentence is a source reading with no
citation, and JBS carries no such analysis in the issue body. The 25.0.3 `xfer` (line 574) reads
`q = p.next` _before_ attempting `p.cmpExItem(m, e)`, so a lost exchange on a stale
`q == null` does `break restart` and returns `null` — consistent with the sentence, but that is my
inference, not evidence. Either cite the JDK 26 changeset or mark the sentence as inference.

### mi10. The architecture-test bullet reaches into `executors-and-task-lifecycle`, which the description excludes

`SKILL.md:197-199` — "An architecture test failing the build on the no-arg
`new LinkedBlockingQueue<>()`, `Executors.newFixedThreadPool`, `newSingleThreadExecutor`, and any
`ThreadPoolExecutor` whose queue reports `Integer.MAX_VALUE` remaining capacity. Highest return on
this list." Three of those four targets are executor factories, and
`executors-and-task-lifecycle/SKILL.md:61-64` already states the fact
("`Executors.newFixedThreadPool` and `newSingleThreadExecutor` use an unbounded
`LinkedBlockingQueue`"). `queues.md:96-99` hedges this ("pool internals belong to
executors-and-task-lifecycle, the queue choice is ours"); `SKILL.md` does not. Either hedge it
identically or reduce the rule to the queue constructors. (There is also an `architecture-testing`
skill in this repo that owns how to write such a rule.)

### mi11. The poison-pill sample leaves a poison in the queue and can block the last consumer

`references/queues.md:34-47`:

```java
if (t == POISON) { q.put(POISON); return; }   // put it back for the next consumer
```

Two unstated consequences. The last consumer also puts it back, so the queue never empties — fine
for a queue that dies with the process, a leak if the queue is reused or drained by a supervisor.
And `put` is the blocking form: on a bounded queue whose producer is still filling, the shutting-down
consumer blocks on the shutdown path. One sentence, or use the "one poison per consumer" variant the
same paragraph offers as an alternative.

---

## NIT

### n1. "no `peek`, no iteration" on `SynchronousQueue` — the methods exist and are silent

`SKILL.md:68` and `references/queues.md:56`. The phrasing mirrors the javadoc
(`SynchronousQueue.java:58-60`: "You cannot `peek` at a synchronous queue … you cannot iterate as
there is nothing to iterate"), so it is defensible. But run on 25.0.3:

```
4. SynchronousQueue size=0 isEmpty=true peek=null iterator.hasNext=false remainingCapacity=0
```

`peek()` compiles and returns `null`; `iterator()` returns an empty iterator; nothing throws. Since
the sentence's whole point is "every monitoring hook lies", say that the methods are present and
lie rather than absent.

### n2. `ConcurrentLinkedQueue.isEmpty()` is amortised O(1), not O(1)

`references/queues.md:216` — "Use `isEmpty()` (O(1) — it only checks for a first node)".
`ConcurrentLinkedQueue.java:446-448` is `return first() == null;`, and `first()` walks past
self-linked and already-matched nodes before it finds one. The javadoc makes no complexity claim.
The advice is right; "amortised O(1), not a traversal" is the accurate phrasing.

### n3. The AQS CLH-replacement history is unverifiable here and changes no decision

`references/locks.md:244-248` — "the CLH-variant queue implementation was replaced in **JDK 14**
(`waitStatus` disappears between `jdk-13+33` and `jdk-14+36` …)". I could not check this against
the local sources (25.0.3 only) and did not fetch the tags. The paragraph then concedes that "the
public `tryAcquire`/`tryRelease`/state contract is unchanged, so nothing written against it broke".
A subtraction-pass candidate: it is trivia in a section whose job is to keep people _out_ of AQS.

### n4. One secondary source in an otherwise primary-source skill

`references/locks.md:205-208` cites "Heinz Kabutz, JavaSpecialists 321" for `StampedLock` writer
starvation and hedges it correctly ("the magnitude is one author's harness and unverified, the
direction is consistent"). Well handled; flagged only so a future editor does not silently promote
it to fact.

---

## Verified — the six load-bearing claims

**1. `LinkedTransferQueue.poll()` returns null on a non-empty queue, JDK 21-25 — CONFIRMED, and
reproduced locally.** JBS REST: summary _"LinkedTransferQueue.poll() returns null even though
queue is not empty"_, Affects Version/s **21, 22, 23, 24, 25**, Fix Version/s **26**, Resolution
Fixed. The reporter's harness, run on Temurin 25.0.3+9:

```
class java.util.concurrent.LinkedTransferQueue
  total failed polls on non-empty queue: 7
class java.util.concurrent.LinkedBlockingQueue
  total failed polls on non-empty queue: 0
class java.util.concurrent.ArrayBlockingQueue
  total failed polls on non-empty queue: 0
```

`JDK-8301341` ("LinkedTransferQueue does not respect timeout for poll()", fix version 22) is also
real, so the JDK 21 caveat at `queues.md:166-168` holds.

**2. RRWL reader cap is `Integer.MAX_VALUE` on JDK 25 — CONFIRMED.**
`ReentrantReadWriteLock.java:254` `abstract static class Sync extends AbstractQueuedLongSynchronizer`;
line 264 `SHARED_SHIFT = 32`; line 266 `static final long MAX_COUNT = Integer.MAX_VALUE;`. The class
javadoc was updated to match (lines 210-211: "This lock supports a maximum of
`Integer.MAX_VALUE` recursive write locks and `Integer.MAX_VALUE` read locks"). JDK-8352971 and
JDK-8354016 both carry fix version 25. Executed: 200 000 reentrant read acquisitions, no `Error`.

**3. `ConcurrentSkipListMap`/`Set.size()` is a `LongAdder` estimate since JDK 10 — CONFIRMED**
(implementation; the javadoc half of the claim is wrong — see M2).
`ConcurrentSkipListMap.java:343` `private transient LongAdder adder`; `size()` at line 1396 reads
`getAdderCount()`; `ConcurrentSkipListSet.size()` delegates to it. JDK-8186226, fix version 10.

**4. `Semaphore.tryAcquire()` ignores fairness, `tryAcquire(0, unit)` honours it — CONFIRMED, and
proved deterministically.** `Semaphore.java:368-370` `tryAcquire()` → `sync.nonfairTryAcquireShared(1)`
regardless of fairness; line 413-416 `tryAcquire(long, TimeUnit)` → `sync.tryAcquireSharedNanos`,
which routes through `FairSync.tryAcquireShared` and its `hasQueuedPredecessors()` check. With a
predecessor queued and a permit free:

```
fair=true  available=1 queued=1 -> tryAcquire()=true, tryAcquire(0,SECONDS)=false
fair=false available=1 queued=1 -> tryAcquire()=true, tryAcquire(0,SECONDS)=true
```

The javadoc quotation at `synchronizers-and-conditions.md:102-104` is verbatim
(`Semaphore.java:352-363`).

**5. `compute*`/`merge` hold the bin-head monitor across the caller's function — CONFIRMED; the
skill does not overstate the _atomicity_, but does overstate the _detection_ (B1).**
`computeIfAbsent` (line 1707) takes `synchronized (f)` on the bin head, or `synchronized (r)` on a
fresh `ReservationNode` CAS'd into an empty bin; `merge` (line 2042) takes `synchronized (f)`. What
the javadoc promises is weaker and vaguer than what the skill asserts — "Some attempted update
operations on this map by other threads **may** be blocked while computation is in progress, so the
computation should be short and simple" (lines 1687-1691) — and it never mentions bins. The skill's
"while holding the monitor on the bin head node" is true of the implementation and is the right thing
to teach; `collections.md:63` flags source-derivation for the deadlock case but not for this one.
Worth one clause ("implementation, not specification") for consistency. The atomicity quotation is
verbatim on all four methods (lines 1686, 1799, 1894, 2027), and `merge`'s missing
`@throws IllegalStateException` is real.

**6. JEP 491 (JDK 24) ended monitor pinning and removed `-Djdk.tracePinnedThreads` — CONFIRMED.**
JEP 491, Status _Closed / Delivered_, **Release 24**. Verbatim: _"This system property will no
longer be needed once the synchronized keyword no longer pins virtual threads… We will therefore
remove this system property; setting it on the command line will have no effect."_ And: _"such
migration will no longer be necessary. You need not revert code that has been migrated to use
ReentrantLock back to using synchronized."_ And: _"you can choose between synchronized and the APIs
in the java.util.concurrent.locks package based solely upon which best solves the problem at hand."_
Local behaviour on 25.0.3 — `java -Djdk.tracePinnedThreads=full` starts normally, prints no
warning, produces no output when a virtual thread blocks inside `synchronized`, and
`System.getProperty` still returns `"full"`, so the property is _accepted and inert_, exactly as the
skill says. `jdk.VirtualThreadPinned`'s fields are confirmed by `jfr metadata`:
`blockingOperation`, `pinnedReason`, `carrierThread`.

## Also verified (spot checks)

- Every sample compiles: `javac --release 25 -Xlint:all` clean on all fourteen, `java.base` only.
- JFR thresholds: `jdk.ThreadPark`, `jdk.JavaMonitorEnter`, `jdk.JavaMonitorWait` all **20 ms** in
  `lib/jfr/default.jfc`, **10 ms** in `profile.jfc`. `jdk.ThreadPark` carries `parkedClass`.
- `Phaser` party cap: `bulkRegister(65535)` succeeds, one more throws
  `IllegalStateException: Attempt to register more than 65535 parties`.
- `DelayQueue.drainTo` drains only the expired element (2 queued, 1 drained, `peek() != null`
  afterwards) — the `queues.md:180-182` claim.
- `readLock().newCondition()` throws `UnsupportedOperationException`; `writeLock().tryLock()` while
  holding the read lock returns `false`.
- `Semaphore(8)` after two stray `release()` calls reports `availablePermits() = 10`.
- `CopyOnWriteArrayList` iterator `remove()` throws UOE; `null` elements permitted.
- `keySet(sentinel).add` inserts the sentinel; `keySet().add` throws UOE;
  `ConcurrentHashMap.newKeySet(int)` exists.
- `new LinkedBlockingDeque<>().remainingCapacity()` and `new LinkedTransferQueue<>().remainingCapacity()`
  are both `2147483647`.
- The `StampedLock.distanceFromOrigin` sample is verbatim from the JDK 25 javadoc
  (`StampedLock.java`, class comment), including `retryHoldingLock` and `isReadLockStamp`.
- The `Condition` bounded-buffer and `awaitNanos` samples are verbatim from the `Condition` javadoc;
  the `ReentrantLock` `class X` sample and its two comments are verbatim from `ReentrantLock.java`
  (JDK-8278255, fix version 23).
- Quotations checked verbatim against 25.0.3 sources: `BlockingQueue` (poison, remaining capacity),
  `DelayQueue` ("intentionally violates the general contract"), `SynchronousQueue`, `CountDownLatch`
  ("one-shot phenomenon"), `CyclicBarrier`, `Phaser` ("transient states"), `Exchanger` ("bidirectional
  form of a SynchronousQueue"), `Condition`, `ReentrantLock` ("often much slower"), `ReentrantReadWriteLock`
  ("will never succeed", "only a probabilistic effect"), `StampedLock` ("wildly inconsistent",
  "no sooner than one year", "guessable"), AQS ("greedy, renouncement, and convoy-avoidance",
  "non-public internal helper classes"), `ConcurrentHashMap` ("scalable frequency map" with `LongAdder`,
  `concurrencyLevel` "additional hint for internal sizing", `Segment` as a serialization stub),
  and the `java.util.concurrent` package summary on synchronized wrappers.
- Manifest/frontmatter consistency: `name` matches the directory in both; the frontmatter declares no
  `version`, so nothing to reconcile; the two descriptions are byte-identical after whitespace folding.
- `registry/skills.yaml` entry is current for this package: recomputed
  `sha256-gEQaKxDXZOgUgKrNAoKaLZFzkCL4+tSYmNqX0mIZT08=`, identical to line 642. (`registry:check`
  fails repo-wide, but from other uncommitted skills, not this one.)
- No obsolescence hits: no `Thread.stop`, no finalizers, no `SecurityManager`, no biased-locking
  performance argument (`locks.md:26-29` correctly dates JEP 374/JDK-8256425), no `Segment`-era CHM
  claim, no pre-JEP-491 pinning advice.

---

## Trigger quality

Judged from the frontmatter description alone, **and from the first 1024 characters of it**, since
that is what Claude Code shows (M1).

**Six prompts that must select this skill**

| #   | Prompt                                                                                               | Lands?                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Our cache does `map.computeIfAbsent(id, k -> repository.findById(k))` — is that a problem?"         | **Yes, cleanly.** "when computeIfAbsent loads from a database" is in the visible half and is unique to this skill.                                                                                                                                                                                            |
| 2   | "We're seeing `IllegalStateException: Recursive update` out of `ConcurrentHashMap.computeIfAbsent`." | **Yes, cleanly.** Verbatim trigger, visible, unique.                                                                                                                                                                                                                                                          |
| 3   | "Should the producer use `offer()`, `put()` or `add()` here?"                                        | **Yes.** "which of its four insert and remove forms" plus "when an `offer()` boolean is discarded", both visible.                                                                                                                                                                                             |
| 4   | "N workers have to meet at the end of every round — `CountDownLatch` or `CyclicBarrier`?"            | **Yes.** "latch versus barrier versus phaser versus semaphore", visible.                                                                                                                                                                                                                                      |
| 5   | "This service constructs `new LinkedBlockingQueue<>()` and hands it to a `ThreadPoolExecutor`."      | **Ambiguous.** The queue clause is visible and exact, but `executors-and-task-lifecycle` names `ThreadPoolExecutor` and the unbounded-queue factories in _its_ body, and this skill's exclusion for it is in the truncated tail. Selection is a coin-flip that gets worse when the prompt says "pool".        |
| 6   | "Swap this `ReentrantReadWriteLock` for a `StampedLock` in the hot read path?"                       | **Ambiguous.** "ReentrantLock versus ReentrantReadWriteLock versus StampedLock chosen on capability" is visible and precise, but `lock-inflation/SKILL.md:85-86` also owns `StampedLock` non-reentrancy and triggers on "throughput stops scaling as threads are added" — a phrasing many such prompts carry. |

**Four near-misses that must select a named neighbour**

| #   | Prompt                                                                    | Should reach                                 | Lands?                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | "Is this class thread-safe? Shared `HashMap` field, no documentation."    | `java-thread-safety-contracts`               | **Yes.** Nothing in the visible half claims the contract question.                                                                                                                                                                                                                       |
| B   | "Thread dump: 40 threads BLOCKED on one `synchronized` block."            | `lock-inflation` / `concurrency-diagnostics` | **Yes.** The visible symptom triggers are `CountDownLatch$Sync` and `CyclicBarrier.dowait`, both distinct.                                                                                                                                                                               |
| C   | "`Semaphore(8)` in front of the payments API — is 8 the right number?"    | `concurrency-limiting-and-bulkheads`         | **Ambiguous.** "latch versus barrier versus phaser versus semaphore" reads as a semaphore skill; the exclusion that would settle it is truncated away, and mi4's fairness advice actively competes.                                                                                      |
| D   | "Our JAVA_OPTS still sets `-Djdk.tracePinnedThreads` and we get nothing." | `virtual-threads-internals`                  | **Yes today, by accident.** The clause claiming this trigger sits at character ~1330 and is never shown. Shortening the description without deleting that clause (the obvious fix for M1) would _create_ a six-way collision — see M4. Delete the clause, do not merely move it forward. |

---

## Could not verify

- **No backport of JDK-8371740 exists** (`SKILL.md:105`, `queues.md:148`). JBS `linkedIssues`
  and summary searches both returned zero rows, which is consistent with "no backport" but is
  absence of evidence, not evidence of absence. The claim is correctly hedged ("as of writing").
- **The JDK 26 fix mechanism** for JDK-8371740 (`queues.md:149-150`) — see mi9.
- **`JDK-8062841` "backported to an 8u"** (`collections.md:57`). JBS shows fix version 9; the
  backport row was not checked. The brief itself lists this as an open question
  (`research-brief.md:1758`).
- **The AQS CLH-queue replacement in JDK 14** (`locks.md:244-248`) — tag-diff claim, not checkable
  against a single installed JDK; see n3.
- **`StampedLock` writer-starvation magnitude** (`locks.md:205-208`) — explicitly hedged by the
  author as one harness, unverified. Left alone.
- **Spring Boot's default task-executor queue capacity** (`queues.md:99-100`) — outside the
  `java.base`-only scope of this review.
