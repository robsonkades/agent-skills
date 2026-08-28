# Concurrency review checklist

## Reviewing concurrent code

- [ ] Does every field written by one thread and read by another have a happens-before
      edge established by one of the rules?
- [ ] Are control flags between threads `volatile`?
- [ ] Do read-modify-write operations (`++`, `+=`, check-then-act) use `Atomic*`,
      `LongAdder` or a lock?
- [ ] Are invariants spanning more than one field under a **single** lock rather than
      per-field `volatile`?
- [ ] Are objects published between threads published via `volatile`, `synchronized`,
      `Atomic*`, or do they have only `final` fields?
- [ ] Does any constructor let `this` escape — including `new Thread(this)` or
      registration in a static collection?
- [ ] If double-checked locking exists, is the field `volatile`? (Or has it been replaced
      by a static holder?)
- [ ] Do `synchronized` blocks protecting the same data use the same monitor?
- [ ] Have shared `long`/`double` fields without `volatile` been reviewed for atomicity
      (JLS §17.7)?
- [ ] Are SpotBugs and Error Prone in CI, failing the build, with no suppressions in the
      concurrent classes?

The static-analysis line is not a formality: `IS2_INCONSISTENT_SYNC`, `DC_DOUBLECHECK` and
`VO_VOLATILE_INCREMENT` alone cover three of the most common defects here, in seconds of CI.

## Investigating an incident

- [ ] Is the symptom visibility (never sees it), atomicity (loses updates), or ordering
      (sees it half-built)?
- [ ] Did the tested mitigation only reduce the frequency? If so, suspect a narrowed race
      window, not a closed one.
- [ ] Thread dump collected with `jcmd <pid> Thread.dump_to_file -format=json` (required if
      virtual threads are in use)?
- [ ] JFR collected — remembering that it shows **contention, not races**, and that the
      default threshold hides short events?
- [ ] Was static analysis run over the suspect code before the elaborate hypothesis?
- [ ] Was the suspect pattern reduced to a jcstress test?
- [ ] Was the fix validated on x86 **and** aarch64?

## The measurement trap

A service that is wrong because of a missing `volatile` looks perfectly healthy in every
tool that measures blocking. There is no event, no wait, no contention — the code runs at
full speed and produces the wrong answer occasionally.

This is the reason the review checklist above exists: for this defect class, review and
static analysis are the detection mechanism. Observability is not.
