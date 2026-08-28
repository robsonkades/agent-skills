# Release record — `java-legacy-code-testing`

|                  |                                                                          |
| ---------------- | ------------------------------------------------------------------------ |
| **Version**      | 1.0.0                                                                    |
| **Status**       | Gate **PASS** — 0 BLOCKER, 0 MAJOR (iteration 3)                         |
| **Date**         | 2026-08-28                                                               |
| **Baseline**     | Java 21 LTS, aware of 25; verified on Temurin 25.0.3 with `--release 21` |
| **Body**         | 284 lines · manifest description 1017 chars · 8 files                    |
| **Dependencies** | none — both samples compile against `java.base` alone                    |

## Why this skill exists

`java-refactoring` step 1 says "no net, no refactoring" and asks for characterisation tests
first. It has nothing for the case where you **cannot construct the object, cannot reach the
method, and cannot run it at all** — which is Feathers's Part III, roughly 90 pages.

Verified against the working tree at draft time, across 239 other skills: the word "seam" appeared
three times, all incidental, never defined; **zero** occurrences of `Extract Interface`,
`Parameterize Constructor`, `Subclass and Override`, `Sprout`, `Introduce Instance Delegator`,
`Expose Static Method`, `Preserve Signatures`, `Lean on the Compiler`, `enabling point`,
`effect sketch` or `Legacy Code Change Algorithm`.

The strongest argument was never the catalogue but the **contradiction it resolves**:
`tdd/references/when-tdd-pays.md` routed seam work to `java-refactoring`, which did not contain
it — a dangling pointer — and `java-refactoring`'s "no net, no refactoring" is, read literally, a
deadlock for the one case where the net cannot be got in. Feathers's own answer (p. xxi: the
dependency-breaking refactorings "are meant to be done **without tests**, in the service of putting
tests in place", constrained by the ch. 23 disciplines) belongs in a skill of its own rather than
bolted onto either neighbour.

## Sources

- Michael Feathers, _Working Effectively with Legacy Code_ (2004). Chapter 25's 24 techniques and
  chapter 6's four, with page numbers from the book's own table of contents. Definitions of
  legacy code (p. xvi), seam and enabling point (ch. 4), and the p. xxi admission are quoted;
  chapters 11–12 are marked `[secondary]` — corroborated across summaries, primary text not read.
- Martin Fowler, `bliki/LegacySeam.html` — corroborates the seam definitions and adds the
  observability and strangler uses. **`bliki/ApprovalTesting.html` does not exist** (404) and is
  not cited; the authority for approval testing is Emily Bache.
- Maven Central metadata (2026-08-27) for every coordinate.
- Full brief: `research-brief.md` (864 lines).

## Validation iterations

| Iter | BLOCKER | MAJOR | MINOR | NIT | Result   |
| ---- | ------- | ----- | ----- | --- | -------- |
| 1    | 1       | 4     | 8     | 4   | FAIL     |
| 2    | 0       | 1     | 6     | 6   | FAIL     |
| 3    | 0       | 0     | 4     | 7   | **PASS** |

The four MINORs from iteration 3 were fixed before release rather than carried; the NITs are
disclosed below.

### What the gate actually caught

**Iteration 1, BLOCKER — a contradiction between two installed skills.** The draft told the reader
to keep a characterisation suite permanently, labelled `Characterization`, when intent had not
been recovered. `java-refactoring/references/safety-workflow.md` states the opposite without
exception: the pinned suite "must not survive as the permanent suite". Two installed skills, two
opposite instructions, no way for a runtime to resolve it. Resolved by ceding characterisation
policy entirely to `java-refactoring` and recording the counter-position without endorsing it.

**Iteration 1, MAJOR — `Clock` had two owners already.** `java-test-design/references/determinism.md`
carries a near-identical worked example (`RenewalPolicy(Clock)`, the same `Instant.parse` date) and
`java-test-doubles/references/mockito-hazards.md` carries the "inject a `Clock` instead" advice.
The draft was the third copy. Reduced to one routing sentence plus the historical sweep row.

**Iteration 1, MAJOR — the shipped example violated the skill's own rule.** `After.java` had a
`RateGateway(boolean stub)` bypass constructor — a test-only member on production-shaped code,
which the Rules section forbids — and a comment referring to a "test subclass below" that did not
exist.

**Iteration 2, MAJOR — the fix for that introduced a regression.** Making `RateGateway` the
interface and renaming the class to `LiveRateGateway` is **Extract Implementer (p. 356)**, not
Extract Interface (p. 362): it breaks every `new RateGateway()` in the codebase, in the very
section that teaches Preserve Signatures. Corrected by giving the interface a new name (`Rates`)
and leaving the concrete class alone.

Iteration 3 proved the corrected claim by compilation rather than by reading: one byte-identical
caller compiles against both the before and after trees, and its `Caller.class` disassembly is
unchanged. The same caller against the Extract Implementer shape fails with
`RateGateway is abstract; cannot be instantiated` — exactly the cost the skill now attributes to 356.

## Reciprocal edits landed in neighbouring skills

Required by the house rule that an overlap is narrowed in **both** directions. None needed a
version bump — all are untracked or already bumped within the same uncommitted batch.

| Skill                             | Edit                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tdd`                             | `references/when-tdd-pays.md` dangling pointer repointed: seam creation here, characterisation and refactoring to `java-refactoring`. Exclusion added to both descriptions |
| `java-refactoring`                | Workflow step 1 gained the carve-out to "no net, no refactoring" naming this skill. Exclusion added to both descriptions                                                   |
| `java-test-doubles`               | `references/mockito-hazards.md` had the **same dangling pointer** (routing "getting a legacy class under test" to `java-refactoring`) — repointed. Exclusion added         |
| `java-testing-strategy`           | Exclusion added to both descriptions                                                                                                                                       |
| `legacy-enterprise-modernization` | Disambiguation of "interception point" (theirs diverts, Feathers's observes) plus exclusion                                                                                |

## Verified behaviour

`scripts/renewal-service/verify.sh`, Temurin 25.0.3:

```
--- Before.java: MUST fail before any assertion is reached
OK: Exception in thread "main" java.lang.IllegalStateException: RateGateway: cannot connect to policy-db

--- After.java: constructs, runs, deterministic
due = [P1]
same answer on every machine, on every date
```

The script exits non-zero if the before state ever becomes constructible, or if it fails for a
different reason.

## Residual NITs, disclosed

1. `After.java`'s "only the method `RenewalCheck` actually calls" comment is literally true but
   vacuous — `RateGateway` has one method, so the subset is 100% of the surface. The subset rule is
   taught in the catalogue and in Over-application; the script cannot demonstrate it.
2. Neither description names the Sprout/Wrap **situation** ("add behaviour to a method too long to
   read, by Thursday") — it appears only as a capability, so a prompt phrased purely as a deadline
   may under-select.
3. `"when a test would need the real database"` is a weak false-positive risk for
   Testcontainers-setup questions belonging to `java-testing-strategy`.
4. `references/seams-and-interception.md`'s four-route effect enumeration is marked
   `UNVERIFIED:` — it is this skill's framing, not Feathers's wording.
5. `references/tooling-and-modernization.md` states flatly one claim the brief hedged ("there is no
   Fowler bliki entry on approval testing" — the brief said "that I could verify").
6. Two close paraphrases of neighbour sentences, both cited inline rather than forked: the
   assertions-versus-approval decision rule (`java-refactoring`) and "the design argument survives
   the technical one" (`java-test-doubles`).
7. `SKILL.md` is 284 lines — large for this repo (median ~840 words; this is ~2600). The
   duplication that caused it was removed across iterations 2 and 3; what remains is content.

## Known limits

- Library versions were read from Maven Central metadata on 2026-08-27 and were **not**
  re-resolved during validation (no network in the gate environment). The artifact ids and the
  traps — the `testcontainers-` prefix rename, `mockito-inline` being dead, PowerMock's Mockito
  3.3.3 pin — matter more than the exact patch versions and move much more slowly.
- No JUnit, Mockito, AssertJ or ApprovalTests sample is executed by `verify.sh`; the scripts are
  `java.base`-only by design, so the approval-testing guidance is source-verified but not
  run-verified here.
- `npm run registry:check` fails in this working tree. Independently confirmed **not** to be this
  skill: `computePackageIntegrity` for this package matches `registry/skills.yaml` byte for byte.
  The drift is in an unrelated skill being edited concurrently by another session.
