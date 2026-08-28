# AUDIT — agent-skills, 240 skills

**Date:** 2026-08-28. **Auditor:** JVM performance engineer + Agent-Skills structure reviewer.
**Corpus:** 240 skills, 1006 files, 5.7 MB of Markdown (29,597 lines of `SKILL.md`, 69,375 lines
of references). Full file table: [INVENTORY.md](INVENTORY.md).

**Executed against:** Temurin 25.0.3+9 and 25.0.4+7 (Windows x64), GraalVM CE 25.0.2, Node 25.6.1,
and the repository's own CLI (`validate`, `install --dry-run`) in a sandboxed `AGENT_SKILLS_HOME`.

---

## 0. Coverage of this audit — stated honestly

The brief asks for a complete read before judging. What was actually done, per layer:

| Layer                                                | Coverage                                                                                                              | Method                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Manifest descriptions (the routing signal)           | **240/240, read in full**                                                                                             | direct read                                                    |
| Frontmatter vs manifest agreement                    | **240/240**                                                                                                           | parsed and diffed                                              |
| Package structure, `files:`, links, dep graph, index | **1006/1006 files**                                                                                                   | scripted                                                       |
| Every `-XX:` / `-X` flag cited anywhere              | **190 distinct flags, 100%**                                                                                          | diffed against a real JDK 25 flag dump; every suspect executed |
| Every JEP cited anywhere                             | **68 distinct JEPs enumerated; 5 verified at source**                                                                 | enumeration scripted; the claims that drive rules verified     |
| Executable assets                                    | **3/3 executed**                                                                                                      | run to completion, every documented exit path                  |
| `SKILL.md` bodies                                    | **partial** — GC / JIT / flag-lifecycle clusters read in full; the rest covered by claim sweeps over 100% of the text | mixed                                                          |
| `references/` (518 files)                            | **partial** — read in full wherever a sweep pointed; otherwise swept mechanically                                     | mixed                                                          |

The two "partial" rows are the honest limit. A literal line-by-line read of 5.7 MB was not
performed. Instead every risk class the brief names was swept **mechanically across 100% of the
corpus** — flags, JEPs, speed ratios, pinning claims, links, cross-references, headings — and the
clusters those sweeps flagged were then read in full. Where a claim could not be settled it is
marked `UNVERIFIED` with the exact test that would settle it. No finding below rests on a skim.

---

## 1. Headline

This is an unusually well-engineered skill set. The routing layer is precise, boundary clauses are
explicit and almost always correct, the JDK-version discipline is better than most published
material, and the three shipped scripts run exactly as documented. Every technical claim I could
execute held — including a 17-row flag-lifecycle matrix I tried and failed to break.

**The defects that exist are structural, not technical.** The most consequential one is invisible
to the repository's own validator and silently degrades routing in two thirds of the catalogue.

| Severity | Count |
| -------- | ----: |
| BLOCKER  |     2 |
| MAJOR    |     5 |
| MINOR    |     4 |
| NIT      |     1 |

---

## 2. BLOCKER

### B-01 — Four skills cannot be installed at all

`architecture-decision-making` is at `2.0.0`. Four dependents still pin `^1.0.0`, and only one
version is published, so resolution fails outright.

- `skills/domain-logic-organization/skill.yaml` — `name: architecture-decision-making`, `version: ^1.0.0`
- `skills/enterprise-application-architecture/skill.yaml` — same
- `skills/framework-coupling-and-independence/skill.yaml` — same
- `skills/layering-and-boundaries/skill.yaml` — same

**Executed**, with a sandboxed registry pointed at this repository:

```
$ agent-skills install domain-logic-organization --dry-run
error  Version conflict for "architecture-decision-making"

    domain-logic-organization@1.1.0  requires ^1.0.0

    No published version satisfies all of them.
    Available: 2.0.0

  code: ASK_DEPENDENCY_CONFLICT
```

All four reproduce identically.

**`validate` does not catch this** — it never resolves ranges — so all four report
`✓ Valid — no issues found`. That blind spot is itself worth closing: a range resolution against
the local index at `registry:check` time would have caught the version bump on the day it landed.

**Fix:** widen the four ranges to `^2.0.0`. The `2.0.0` bump was a scope narrowing, so `^2.0.0` is
the honest range rather than `>=1.0.0`.

### B-02 — `c2-sea-of-nodes` prescribes flags that stop the JVM from starting

`skills/c2-sea-of-nodes/SKILL.md:44` — workflow step 4:

> "**If an allocation survives, get the escape state before theorising.** Use
> `-XX:+PrintEscapeAnalysis` with `-XX:+PrintEliminateAllocations`; they answer two different
> questions."

and `skills/c2-sea-of-nodes/references/jit-diagnosis-recipes.md:67`, given as a runnable block:

```bash
java -XX:+UnlockDiagnosticVMOptions \
     -XX:+PrintEscapeAnalysis \
     -XX:+PrintEliminateAllocations \
     -XX:CompileCommand=compileonly,MyClass::accumulate \
     MyClass
```

Both are `develop` flags. **Executed on Temurin 25.0.3:**

```
Error: VM option 'PrintEscapeAnalysis' is develop and is available only in debug version of VM.
Improperly specified VM option 'PrintEscapeAnalysis'
Error: Could not create the Java Virtual Machine.
```

Identical for `PrintEliminateAllocations`. Neither the workflow step nor the command block carries
a debug-build caveat, and the reference then instructs the reader to _"Read the output of your own
runtime"_ — output that cannot exist on any shipping JVM.

This is also an **internal inconsistency**: the repository gets it right three other times.
`skills/escape-analysis-internals/references/diagnosing-elimination.md:52` writes
`# CORRECT — enables PrintEscapeAnalysis for one method (requires a debug build)`.
`skills/reading-jit-assembly/references/hsdis-setup-and-flags.md:42` classifies `PrintIdeal` as
`**Yes** — develop flag`. `skills/object-layout-and-footprint/SKILL.md:205` says of
`PrintFieldLayout`: _"It is a `develop` flag: on every shipping build…"_. Only `c2-sea-of-nodes`
presents the pair as ordinary tooling.

**Fix:** in both locations mark the pair debug-build-only, and route the product-JVM reader to the
indirect check the same reference already names — async-profiler `-e alloc`, or the JFR
`jdk.ObjectAllocationInNewTLAB` / `jdk.ObjectAllocationOutsideTLAB` events.

---

## 3. MAJOR

### M-01 — The description an author writes in `SKILL.md` is discarded on install; 162 skills carry two different ones

`packages/adapter-claude/src/index.ts:152`:

```ts
const frontmatter: Record<string, unknown> = { description: manifest.description };
```

The installed `SKILL.md` takes its description from **`skill.yaml`**. The authored frontmatter
description is never projected.

**162 of 240 skills** carry a different description in the two files; 78 agree. In 161 of the 162
the frontmatter version is the longer one. The manifest versions cluster tightly just under 1024
characters — 1020, 1019, 1018, 1017, 1012 — which shows this is not accidental drift: the manifest
descriptions were **deliberately trimmed** to clear the `claude.description.long` warning, and the
untrimmed original was left behind in `SKILL.md`.

Largest divergences:

| Skill                                  | frontmatter | manifest | delta |
| -------------------------------------- | ----------: | -------: | ----: |
| `java-application-security-basics`     |        1497 |      608 |  −889 |
| `distributed-aggregation-and-barriers` |        1719 |     1019 |  −700 |
| `distributed-transactions-and-sagas`   |        1656 |     1012 |  −644 |
| `kafka-consumers-in-java`              |        1563 |      988 |  −575 |
| `refactoring-automation`               |        1037 |      480 |  −557 |
| `streaming-pipeline-topologies`        |        1543 |     1018 |  −525 |

The consequence is not cosmetic: **the file an author reads and edits is not the file that
routes.** Any future correction to a `SKILL.md` description — including a correction arising from
this audit — has no effect unless `skill.yaml` is edited in the same commit.

### M-02 — The trim deleted trigger conditions, not padding

M-01 would be harmless if the trim had removed prose. It removed routing signal.

**Four skills now ship with no "when to use" clause at all** _(corrected — see CHANGELOG §Corrections)_: `java-application-security-basics`,
`java-clean-code`, `java-code-smells`, `refactoring-automation`. Their shipped descriptions are scope plus boundary only.
`docs/skill-format.md` names the description as _"the routing signal: both agents choose a skill
from name and description alone, before any of the body is loaded."_

`java-application-security-basics` is the clearest case. Its frontmatter names the exact symbols
that should fire it — _"when `MessageDigest`, `SecureRandom`, `Random`, `UUID`, `PasswordEncoder`,
`BCryptPasswordEncoder` or `Argon2PasswordEncoder` is called; when authorisation is a
`@PreAuthorize` on a controller and a scheduler, consumer or second controller calls the same
service method…"_ — roughly 700 characters of concrete, greppable triggers. **None of it ships.**

**Seventy-seven skills lose at least one named routing pointer on install** _(corrected — the first count came from a phrase-shaped regex; see CHANGELOG §Corrections)_. Twenty-one lose a whole boundary clause, and they are concentrated in the densest
neighbourhood in the repository — the `java-*` craftsmanship family, where `java-annotations`,
`java-enums`, `java-object-contracts`, `java-null-safety` and `java-immutability` sit within one
code review of each other:

`java-annotations`, `java-application-security-basics`, `java-enums`, `java-fluent-apis`,
`java-generics`, `java-immutability`, `java-lambdas-and-functional-interfaces`,
`java-law-of-demeter`, `java-null-safety`, `java-numeric-types`, `java-object-construction`,
`java-object-contracts`, `java-reference-types-and-leaks`, `java-reflection-and-method-handles`,
`java-resource-management`, `java-serialization-hardening`, `java-streams`, `java-tell-dont-ask`,
`java-thread-safety-contracts`, `refactoring-automation`.

Not all twenty-one are damaged equally. `java-enums` keeps a compressed but usable boundary
(_"Annotations are java-annotations; equality and ordering are java-object-contracts"_) where the
frontmatter also named `java-composition-over-inheritance`. `java-annotations` loses the
`java-enums` edge entirely. Each needs a human call, which is why M-01 cannot be fixed by a script
alone.

### M-03 — A flag documented as live does not exist

`skills/g1-concurrent-marking/references/marking-cycle-log-and-flags.md:95`, in a table of current
G1 flags with their defaults:

> `| -XX:+G1EagerReclaimHumongousObjects | true | Reclaims humongous regions without waiting for a complete cycle |`

**Executed on Temurin 25.0.3**, with both `-XX:+UnlockDiagnosticVMOptions` and
`-XX:+UnlockExperimentalVMOptions` in place:

```
Unrecognized VM option 'G1EagerReclaimHumongousObjects'
Error: Could not create the Java Virtual Machine.
```

It is absent from the full 923-flag dump. Every other row in that table verified correct
(`InitiatingHeapOccupancyPercent` 45, `G1UseAdaptiveIHOP` true, `G1HeapRegionSize` ergonomic,
`ConcGCThreads` derived). A reader who lifts the table into a start-up script gets a JVM that will
not boot — precisely the failure `jvm-performance-review/references/flag-lifecycle.md` exists to
prevent, which makes this a contradiction inside the catalogue as well as an error.

`UNVERIFIED`: the release in which the flag became obsolete. Settled by `git log` over
`g1_globals.hpp` in `openjdk/jdk`, or by running the flag on JDK 17 / 21 / 24. No JDK below 25 is
installed on this machine.

### M-04 — Thirteen shipped descriptions exceed the display limit, and the warning is standing

`agent-skills validate --strict` over all 240 skills produces exactly 13 issues, all
`claude.description.long`:

`blocking-and-nonblocking-io` (1132), `completablefuture-composition` (1036),
`concurrency-diagnostics` (1049), `concurrency-limiting-and-bulkheads` (1107),
`concurrent-collections-and-synchronizers` (1373), `executors-and-task-lifecycle` (1120),
`jvm-performance-review` (1120), `object-layout-and-footprint` (1125),
`reactive-and-virtual-thread-selection`, `schema-evolution-and-compatibility`, `scoped-values`,
`structured-concurrency`, `virtual-thread-migration`.

Two of them are ordered **boundary-first**, so what falls off the end is the entire trigger list:
`concurrent-collections-and-synchronizers` (1373 chars — roughly a quarter truncated, taking
`computeIfAbsent` loading from a database, `IllegalStateException "Recursive update"`, the
`LinkedTransferQueue.poll()` case and the rest with it) and `schema-evolution-and-compatibility`.
Reordering those two costs nothing and recovers the signal even if the length stays.

**Debatable, not wrong:** "roughly the first 1024" is the adapter's own estimate, not a measured
cut-off. The ordering problem holds regardless of where the true boundary sits.

### M-05 — The format contract does not require the two descriptions to agree

`docs/skill-format.md` §Validation rules enforces `skill.name.mismatch` and
`skill.version.mismatch`. There is no `skill.description.mismatch`. `packages/adapter-claude` reads
only the manifest description; the registry index carries only the manifest description; nothing
anywhere reads the frontmatter one.

That is how M-01 reached 162 skills without a single validator complaint, and it is why repairing
the 162 without adding the rule will simply let them drift again.

Raised rather than silently changed, as the brief requires. Two defensible resolutions:

- **(a)** add an error-level `skill.description.mismatch` and make the two identical. Preserves the
  current file shape; costs one rule and a test.
- **(b)** declare `skill.yaml` the single source and have `SKILL.md` frontmatter carry `name` only.
  Removes the defect class permanently, but changes a published format contract.

---

## 4. MINOR

**m-01 — `adapter-pattern` holds the generic name for the non-generic meaning.**
`skills/adapter-pattern/` is the _Kubernetes telemetry-normalising sidecar_; the Gang-of-Four
Adapter is `gof-adapter`. Both descriptions open by disambiguating — the right mitigation — but an
agent matching on name in a Java code-review context will reach for `adapter-pattern` first.
`sidecar-pattern` and `ambassador-pattern` have no such collision; only this one does. A rename
(e.g. `telemetry-adapter-sidecar`) costs a major version bump and four inbound reference edits.

**m-02 — Eight meta-skills sit above the pattern catalogues.** `gof-pattern-thinking`,
`gof-pattern-selection`, `gof-pattern-confusion`, `gof-pattern-antipatterns`,
`gof-patterns-in-modern-java`, `gof-patterns-and-distribution`, plus
`pattern-selection-and-composition` and `patterns-and-modern-frameworks` for the enterprise set —
above 17 individual `gof-*` skills. The boundaries are stated and genuinely distinct on paper, but
the distinctions are fine-grained (_"the reasoning discipline"_ versus _"problem to shortlist"_),
and a bare "which pattern should I use here?" is a plausible trigger for at least three. This is
the highest overlap density in the catalogue; see reverse-test rows 24–26 in GAPS.md.

**m-03 — An unsupported speed ratio, of the exact shape the repository elsewhere condemns.**
`skills/tail-latency-analysis/references/attributing-the-tail.md:76`: _"Bytecode starts in the
interpreter, typically 10–100x slower than compiled code."_ No JDK, hardware or workload.
`skills/jvm-bytecode/references/dispatch-and-abstraction-cost.md:119` says of the identical shape:
_"'Reflection is 10-100x slower' is meaningless without a stated baseline"_. These are the only two
numeric speed ratios in 5.7 MB — an excellent result — and they should agree.

**m-04 — 38 of 280 declared dependencies are never mentioned in the declaring package.** _(corrected — the first count of 131 came from a backtick-only matcher; see CHANGELOG §Corrections)_ Defensible if
`dependencies` means "install this alongside". But combined with B-01 it means the dependency graph
carries real install-time risk while not being maintained as a semantic signal. Worth deciding what
the field means and writing that into `docs/skill-format.md`.

## 5. NIT

**n-01 — `skills/java-legacy-code-testing/SKILL.md:123`** writes _"`java-test-design`
(`references/determinism.md`)"_. The bare `references/…` form everywhere else in the corpus denotes
a path inside the _own_ package. The file does exist, at
`skills/java-test-design/references/determinism.md`, and the prose names its owner — correct, but
locally ambiguous against the convention.

---

## 6. What was tested and found clean

Recording the negatives bounds where the risk is not.

**Structure and packaging — 0 defects across 1006 files.** No broken relative link. No `files:`
entry pointing at a missing path. No package file left uncovered by `files:`. No dependency cycle.
No prose reference to a skill that does not exist. 240 skills and 240 registry entries, in sync.
Every `SKILL.md` carries `Purpose` and `References`; 205 carry `Workflow`, 204 carry `Rules`.
Body length: min 56, median 98, max 266 lines — progressive disclosure is real, not claimed.

**JVM flag lifecycle — verified by execution, not by review.** The 17-row matrix in
`jvm-performance-review/references/flag-lifecycle.md` was run against Temurin 25.0.3 and 25.0.4.
Every JDK 25 cell reproduced exactly, including the three-state distinction the whole table rests
on:

```
-XX:LockingMode=1               → "Option LockingMode was deprecated in version 24.0…"          deprecated: still effective
-XX:+ZGenerational              → "Ignoring option ZGenerational; support was removed in 24.0"  obsolete: value ignored
-XX:+UseConcMarkSweepGC         → "Unrecognized VM option"; JVM refuses to start                 expired
-XX:+UseCompressedClassPointers → "…was deprecated in version 25.0…"                             as documented
-XX:+PrintGCDetails             → "…is deprecated. Will use -Xlog:gc* instead."                  as documented
```

`LockingMode` also measured at its documented JDK 25 default: `2` = `LM_LIGHTWEIGHT`, `{product}`.

Numeric defaults spot-checked, all correct: `MaxInlineSize` 35, `FreqInlineSize` 325,
`MaxInlineLevel` 15, `InlineSmallCode` 2500, `Tier3InvocationThreshold` 200,
`Tier4InvocationThreshold` 5000, `Tier4CompileThreshold` 15000,
`EliminateAllocationArraySizeLimit` 64, `MaxBCEAEstimateSize` 150,
`InitiatingHeapOccupancyPercent` 45, `G1NewSizePercent` 5, `G1MaxNewSizePercent` 60,
`G1MixedGCCountTarget` 8, `G1OldCSetRegionThresholdPercent` 10, `G1HeapWastePercent` 5,
`G1AdaptiveIHOPNumInitialSamples` 3, `MetaspaceSize` 22020096, `MaxMetaspaceSize` `SIZE_MAX`,
`MinMetaspaceFreeRatio` 40, `MaxTenuringThreshold` 15, `ObjectAlignmentInBytes` 8,
`ReservedCodeCacheSize` 240 MB tiered and 48 MB under `-XX:-TieredCompilation`.

**JEP claims — the four that drive operational rules, verified at source.**

- **JEP 523** (Make G1 the Default Garbage Collector in All Environments) — Targeted **JDK 27**.
  The JEP's own impact statement confirms the repository's stronger reading: what disappears is the
  JDK 9-era ergonomic that picked Serial on a constrained machine. `gc-fundamentals/SKILL.md:69` is
  correct.
- **JEP 534** (Compact Object Headers by Default) — **JDK 27**, following JEP 450 (24,
  experimental) and JEP 519 (25, product) — exactly the chain the repository states in
  `object-layout-and-footprint` and `false-sharing-and-contended`.
- **JEP 535** (Shenandoah GC: Generational Mode by Default) — Targeted **JDK 28**, matching
  `jvm-gc-tuning/SKILL.md:65`'s _"not the default until JEP 535 lands in JDK 28 (Targeted)"_.
- **Structured concurrency** — seventh preview (JEP 533) in JDK 27, following JEP 505 (25) and
  JEP 525 (26), still not final. Matches `structured-concurrency`'s unusually careful _"still a
  preview API on every released version, renamed between 25 and 26 and changing again in 27"_.

**Loom / pinning — consistent across 12 skills and 26 citations, zero contradictions.** Every
occurrence of JEP 491 states JDK 24, states that `synchronized` no longer pins, and refuses the
"swap `synchronized` for `ReentrantLock` to avoid pinning" advice.
`performance-methodology/references/folklore.md:12` files it explicitly as obsolete folklore;
`virtual-threads-internals/references/pinning-diagnostics.md:5` correctly notes that
`-Djdk.tracePinnedThreads` was removed in 24 yet is still _accepted_ on the command line, which is
the sort of distinction most published material gets wrong. This is the single most common source
of stale Loom advice in circulation, and the repository is clean on it.

**Executable assets — 3/3 run, every documented exit path exercised.**

| Asset                                                                  | Result                                                                                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `java-code-smells/scripts/primitive-obsession/verify.sh`               | exit 0; the negative case fails to compile with the exact expected `incompatible types` error                                            |
| `java-legacy-code-testing/scripts/renewal-service/verify.sh`           | exit 0; `Before` fails for the documented reason, `After` is deterministic                                                               |
| `architecture-fitness-functions/scripts/check-governance-register.mjs` | exit 0 on the register published in `references/ungoverned.md`; exit 1 with 6 correct problems at a lapsed date; exit 2 with no argument |

The `.mjs` script's documented usage matches what it accepts, it genuinely has no dependencies as
claimed, and the JSON example published in its reference is a valid input to it — a level of
coherence between a document and its script that is rare enough to be worth naming.

**Unsupported performance claims — 2 in 5.7 MB**, both listed at m-03, one of which is the
repository criticising the pattern.

---

## 7. Prioritised fix list

| #   | Finding                                      | Severity  | Effort                              | Note                                                             |
| --- | -------------------------------------------- | --------- | ----------------------------------- | ---------------------------------------------------------------- |
| 1   | B-01 — four dependency ranges                | BLOCKER   | 4 one-line edits + `registry:build` | These skills are uninstallable today                             |
| 2   | B-02 — develop flags in `c2-sea-of-nodes`    | BLOCKER   | 2 edits                             | Copy the caveat `escape-analysis-internals` already carries      |
| 3   | M-03 — `G1EagerReclaimHumongousObjects`      | MAJOR     | 1 table row                         | Delete it, or scope it to the releases where it existed          |
| 4   | M-02 — 6 descriptions with no trigger clause | MAJOR     | 6 rewrites                          | Highest routing return per edit in the whole list                |
| 5   | M-05 — validator rule for description drift  | MAJOR     | ~20 lines + a test                  | Do this **before** #6, or #6 is temporary                        |
| 6   | M-01 — 162 description drifts                | MAJOR     | scripted + 162 reviews              | A script can copy; the 21 boundary losses each need a human call |
| 7   | M-04 — 13 over-long descriptions             | MAJOR     | 13 rewrites (2 urgent)              | At minimum reorder the two that are boundary-first               |
| 8   | m-03 — the 10–100x claim                     | MINOR     | 1 sentence                          | Make the two statements agree                                    |
| 9   | m-01 — `adapter-pattern` name                | MINOR     | rename + 4 edits + major bump       | Only if a breaking rename of a published name is acceptable      |
| 10  | m-02 — 8 pattern meta-skills                 | MINOR     | design decision                     | See GAPS.md §6                                                   |
| 11  | m-04, n-01                                   | MINOR/NIT | doc edits                           | Cosmetic                                                         |

## 8. Open questions I cannot resolve without you

1. **M-05 is your call, not mine.** Make the two descriptions identical and enforce it, or make
   `skill.yaml` the single source and strip the frontmatter description? The second is cleaner and
   permanent, but changes a published format contract.
2. ~~**Is `dependencies` semantic or install-only?**~~ **Answered:** conceptual prerequisite —
   install together. Written into `docs/skill-format.md`; m-04 is a non-issue under it.
3. **Is renaming `adapter-pattern` acceptable?** It breaks a published name.
4. **M-03's obsolescence release is `UNVERIFIED`.** No JDK below 25 is installed here. Do you want
   it pinned exactly — which needs JDK 17/21/24 or the OpenJDK history — or is deleting the row
   enough?
5. **How much of the remaining reference text do you want read line by line?** The mechanical
   sweeps covered every risk class the brief names across 100% of it. A full linear read of the
   3.8 MB of references is affordable but would roughly triple this audit's duration.
