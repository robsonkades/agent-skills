# Release record — `concurrent-collections-and-synchronizers`

|                  |                                                              |
| ---------------- | ------------------------------------------------------------ |
| **Version**      | 1.0.0                                                        |
| **Status**       | Gate PASS — 0 BLOCKER, 0 MAJOR, 0 MINOR, 0 NIT (iteration 3) |
| **Date**         | 2026-08-28                                                   |
| **Baseline**     | JDK 25 LTS, with deltas stated inline for 21, 24 and 26      |
| **Body**         | 171 lines · description 1373 characters · 6 files            |
| **Dependencies** | none — every sample compiles against `java.base` alone       |

## Why this skill exists

The repository already had 234 skills and the concurrency family already had twelve. The gap was
narrow and real: `java-thread-safety-contracts` owns the **policy** layer — should this class be
thread-safe, what does it promise, which family to prefer — and nothing owned the **mechanism**
layer beneath it. Which member of the family, with which parameter, and what breaks when it is
wrong. That split is stated in both directions in the description.

## Sources

- _Java Concurrency in Practice_ (Goetz et al., 2006), chapters 5, 11, 13, 14, 15 — used as the
  structural backbone, with every borrowed recommendation marked still-current or superseded. The
  book's `ReentrantLock`-versus-`synchronized` performance argument is Java 5/6 era and is
  superseded twice over: biased locking disabled in JDK 15 (JEP 374), removed in 18, and JEP 491
  removing the pinning argument in 24.
- JDK 25.0.3 (Temurin) `src.zip` — the primary evidence for every claim about `ConcurrentHashMap`,
  `ReentrantReadWriteLock`, `Semaphore`, `LinkedTransferQueue`, `StampedLock` and AQS. Read, not
  recalled.
- JEP 491 (JDK 24), JEP 444, JEP 374; thirteen JBS issues, all citations checked exact.
- `java.util.concurrent` javadoc, JDK 25.

Full brief: `research-brief.md` (1831 lines, 17 sections).

## Validation iterations

| Iter | BLOCKER | MAJOR | MINOR | NIT | Result   |
| ---- | ------- | ----- | ----- | --- | -------- |
| 1    | 2       | 5     | 11    | 4   | FAIL     |
| 2    | 0       | 2     | 4     | 3   | FAIL     |
| 3    | 0       | 0     | 0     | 0   | **PASS** |

Author and validator were separate agents throughout. The validator compiled all 18 code samples
with `javac --release 25 -Xlint:all` and executed the ones with observable behaviour.

**What the gate actually caught.** Both iteration-1 BLOCKERs were cases where the skill and the
research brief agreed and were both wrong — the failure mode a single-agent pipeline cannot detect:

- **B1** — "recursive update into the same bin throws `IllegalStateException`" is false, and false
  in the unsafe direction. Detection in JDK 25 is structural (the `ReservationNode` arm, and
  `computeIfAbsent`'s `pred.next != null` check); `merge` has no `pred.next` check at all. A
  same-bin nested `put` and a same-bin nested `compute` both complete with no throw and leave the
  operation silently non-atomic. The javadoc's word is "detectably", and that is the whole
  guarantee.
- **B2** — the prescribed blocking-loader memoiser cached a transient failure permanently, citing
  JCiP §5.6 while omitting the `cache.remove(arg, f)` that §5.6 exists to add.

One iteration-2 MAJOR was the **validator's own** error from iteration 1, inherited by the author
and caught only when the sentence was finally executed: an interrupted first caller yields
`ExecutionException` and an evicted entry, not a cached `CancellationException`.

Three claims that invert widely repeated advice were reproduced locally rather than cited:
`LinkedTransferQueue.poll()` returning null on a non-empty queue (7 null polls; 0 on LBQ/ABQ);
`Semaphore.tryAcquire()` ignoring fairness while `tryAcquire(0, unit)` honours it; and
`ReentrantReadWriteLock`'s reader cap being `Integer.MAX_VALUE` on JDK 25 (200 000 reentrant read
holds, no error) against 65535 on 21.

## Residual items

**None against the skill.** One open by agreement:

- **n4** — one secondary source (Kabutz) in an otherwise primary-source skill, at
  `references/locks.md:243`. The starvation _direction_ is kept, the magnitude is marked
  unverified. Assessed as correctly hedged in iteration 1; no action.

## Known limits

- **Packaging step: resolved.** It was blocked for a time by `skills/architecture-characteristics`,
  an in-flight package from a concurrent session that had a `SKILL.md` and no `skill.yaml`, which
  aborts `npm run registry:build` for the whole repository. That package landed, the index was
  rebuilt, and `npm run registry:check` now reports up to date at 235 skills. Nothing was done to
  the other session's files. Worth knowing as a repository property: one incomplete package blocks
  the index build for everyone.
- **`claude.description.long` warns** at 1373 characters. Kept deliberately: the failure the lint
  names — exclusions truncated out of the selector's view — is closed and measured, all seven
  exclusions sit inside the visible 1024, and 68 of 234 skills in this repo already exceed it.
  Cutting further would have to come out of an exclusion or a trigger.
- **Four claims could not be verified** and are hedged or excluded in the skill accordingly: that
  no JDK-8371740 backport exists (JBS returned zero linked issues — absence of evidence, not
  evidence of absence), the JDK 26 fix mechanism, the 8u backport of JDK-8062841, and the AQS
  JDK-14 rewrite issue id. Four JDK 26 RFEs marked _Fixed_ in JBS show no corresponding mainline
  code change, so no JDK 26 API is promised anywhere in the skill.
- **Boundary edit still owed.** `java-thread-safety-contracts` should gain a pointer to this skill
  in its description, per the house rule that an overlap is narrowed in both directions. Not done —
  it is an edit to a neighbouring skill and belongs in its own change.

## Files

| File                                         | The capability it provides                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `SKILL.md`                                   | The three selection tables and 15 checkable rules — the whole decision on one screen               |
| `references/collections.md`                  | CHM atomics and the bin lock, weakly consistent views, wrappers, copy-on-write, skip lists         |
| `references/queues.md`                       | The four insert/remove forms, implementation comparison, unbounded-queue failure, the LTQ bug      |
| `references/synchronizers-and-conditions.md` | Latch/barrier/phaser/semaphore failure modes, the `Condition` protocol, a correct bounded buffer   |
| `references/locks.md`                        | The capability table against `synchronized`, RRWL and `StampedLock` hazards, when AQS is justified |
