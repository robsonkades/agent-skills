# Forward-looking JDK project claims — independent verification sweep

**Date:** 2026-08-28. **Verifies:** `docs/skill-validation/jvm-performance-suite-record.md` (2026-08-27).
**Method:** primary sources only — `openjdk.org/jeps/<n>` header status lines, the OpenJDK JEP
index (`openjdk.org/jeps/0`), `openjdk.org/projects/jdk/{26,27,28}`, the OpenJDK bug database
(JBS REST API, `bugs.openjdk.org/rest/api/2`), and pinned `openjdk/jdk` refs
(`jdk-25-ga`, `jdk-26-ga`, `jdk27`, `master`).
**Executed cross-checks:** Temurin 25.0.3+9 and 25.0.4.1+1 (Windows x64). No JDK 21, 26 or 27 is
installed; every 21/26/27/28 claim below is **source-derived**, not executed, and labelled where
it matters.

Note on `openjdk.org`: the site returns HTTP 403 to the fetch tool. All JEP pages here were
retrieved with `curl` and a browser user-agent; status lines are quoted from the page's own
header table.

---

## Top-line disagreements with the prior record

Three items. One is a real factual error that is live in a shipped skill.

### 1. `jdk.OldObjectSample` under ZGC — the prior record's "from 26" is WRONG

The prior record says the event is "unavailable under ZGC **from 26**", and that claim was
written into a skill (`java-reference-types-and-leaks/references/leak-patterns.md:22`) citing
JDK-8382740.

JBS says otherwise. The fix and its backports:

| Issue       | Fix version               | Summary                                                                     |
| ----------- | ------------------------- | --------------------------------------------------------------------------- |
| JDK-8382740 | **27**                    | JFR: Disable `jdk.OldObjectSample` event for generational ZGC               |
| JDK-8383450 | **26.0.2**                | (backport)                                                                  |
| JDK-8383858 | **25.0.4**                | (backport)                                                                  |
| JDK-8382929 | 25.0.4-oracle             | (backport)                                                                  |
| JDK-8386620 | 25.0.4-oracle, 26.0.2, 27 | Release Note: JFR Event `jdk.OldObjectSample` Disabled for Generational ZGC |

Release note text (JDK-8386620), verbatim:

> The JFR event `jdk.OldObjectSample` is disabled when using generational ZGC.
> The combination results in unacceptable performance overhead because the implementation relies
> on weak handles that, in generational ZGC, are processed only in the old generation.

So the correct scope is **JDK 27, backported to 26.0.2 and 25.0.4** — not "from JDK 26". Two
consequences, both of which the current skill text gets wrong:

- **JDK 26.0.0 and 26.0.1 are not affected.** "From JDK 26" over-claims.
- **The repository's own JDK 25 baseline _is_ affected from 25.0.4 onwards.** "From JDK 26"
  under-claims by excluding exactly the release train the skills are written against. This is
  the more damaging half: a reader on 25.0.4 is told the caveat does not apply to them.

**Executed, partial corroboration.** A differential run (200k retained 512-byte arrays,
`settings=profile`, 15 s) on the two local builds:

```
25.0.3   -XX:+UseG1GC -> jdk.OldObjectSample events: 7
25.0.3   -XX:+UseZGC  -> jdk.OldObjectSample events: 0
25.0.4.1 -XX:+UseG1GC -> jdk.OldObjectSample events: 13
25.0.4.1 -XX:+UseZGC  -> jdk.OldObjectSample events: 0
```

ZGC yields zero on **both** builds, so this run confirms the _operational_ advice (under ZGC,
fall back to a heap dump — true across the whole JDK 25 line) but **cannot** separate "disabled
by the 25.0.4 backport" from "the event was already producing nothing under ZGC". That is
consistent with JDK-8375615, _"ZGC: Poor interaction between ZGC and JFRs jdk.OldObjectSample
implementation"_, which is the open bug the disable resolves. Treat the release scoping as
source-derived from JBS, not as reproduced.

### 2. `InitialRAMPercentage`'s "default removed" — CONFIRMED, but the wording hides the effect

The prior record's phrasing is loosely right and practically misleading. Verified against
`src/hotspot/share/gc/shared/gc_globals.hpp`:

```
jdk-25-ga:  product(double, InitialRAMPercentage, 1.5625, ...)
jdk-26-ga:  product(double, InitialRAMPercentage, 0.0,    ...)
jdk27:      product(double, InitialRAMPercentage, 0.0,    ...)
```

The flag was **not** removed; its default changed to `0.0`, and the initial heap is now
`MinHeapSize` (JDK-8371986, CSR JDK-8371987, release note JDK-8375501). Executed on Temurin
25.0.4.1: `InitialRAMPercentage = 1.562500 {product} {default}`, `MaxRAM = 137438953472`
— confirming the pre-26 state directly.

A separate JDK 26 change the prior record folds into the same sentence: **`MaxRAM`'s default
(128 GB) was removed and the flag deprecated** (JDK-8369346, CSR JDK-8369347) — deprecated 26,
obsolete 27, removed 28. These are two changes, not one.

### 3. `-XX:+ZGenerational` is described wrongly in a skill, and the repo contradicts itself

Not from the prior record, but found by this sweep and higher-severity than most rows below.

`skills/zgc-generational-internals/SKILL.md:57` says the flag "is accepted **silently** and does
nothing". Both halves are wrong, and `skills/jvm-performance-review/references/flag-lifecycle.md:43`
in the same repository already has it right.

- **JDK 24–25: accepted, but warns.** Executed on Temurin 25.0.4.1:
  `OpenJDK 64-Bit Server VM warning: Ignoring option ZGenerational; support was removed in 24.0`
  (exit 0). `jdk-25-ga/arguments.cpp`: `{ "ZGenerational", jdk(23), jdk(24), undefined() }`.
- **JDK 26–27: the JVM refuses to start.** `ZGenerational` is absent from `special_jvm_flags`
  in `arguments.cpp` _and_ from `gc/z/z_globals.hpp` on both `jdk-26-ga` and `jdk27` — the
  repository's own flag-lifecycle rules make that an `Unrecognized VM option` startup failure,
  and `flag-lifecycle.md:43` states exactly that ("dropped in 26 … **refuses to start**").

---

## Part A — verification of the prior record's claims

Every JEP status below is quoted from that JEP's own header table.

| #   | Prior-record claim                                                                                   | Verdict                                        | Primary source and quoted status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | JEP 401 (Value Objects) Integrated for JDK 28                                                        | **CONFIRMED**                                  | `openjdk.org/jeps/401`: _"Status Integrated · Release 28"_. Corroborated by `openjdk.org/projects/jdk/28/` "JEPs targeted to JDK 28, so far — 401: Value Objects (Preview)".                                                                                                                                                                                                                                                                                                                                                    |
| A2  | JEP 539 (Strict Field Initialization) Integrated for JDK 28                                          | **CONFIRMED**                                  | `openjdk.org/jeps/539`: _"Status Integrated · Release 28"_. Listed on the JDK 28 project page.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| A3  | JEP 402 is a Draft with no target release                                                            | **CONFIRMED**                                  | `openjdk.org/jeps/402` ("Enhanced Primitive Boxing (Preview)"): _"Status Draft"_ — **no Release row at all**. Updated 2025/11/19. JEP index lists it under Draft JEPs.                                                                                                                                                                                                                                                                                                                                                          |
| A4  | JEP 534 makes compact object headers the default in JDK 27                                           | **CONFIRMED**                                  | `openjdk.org/jeps/534`: _"Status Closed / Delivered · Release 27"_. On the JDK 27 feature list. Body: _"That option will no longer be needed once compact object headers are the default."_                                                                                                                                                                                                                                                                                                                                     |
| A5  | JEP 523 makes G1 the default in **all** environments, ending Serial-on-constrained-containers        | **CONFIRMED**                                  | `openjdk.org/jeps/523`: _"Status Closed / Delivered · Release 27"_. Body: _"If you do not specify a garbage collector on the command line then the JVM will always select G1, regardless of the number of processors and the available physical memory"_ and _"It is time to stop selecting Serial by default in constrained environments."_                                                                                                                                                                                    |
| A6  | `-XX:LockingMode` obsolete in 26, removed in 27                                                      | **CONFIRMED**                                  | `jdk-26-ga/arguments.cpp`: `{ "LockingMode", jdk(24), jdk(26), jdk(27) }` (deprecated / obsolete / expired). In `jdk27` the entry is **gone entirely**, and `LockingMode` no longer appears in `runtime/globals.hpp` on 26 or 27 (it does on 25). Executed on 25.0.4.1: _"Option LockingMode was deprecated in version 24.0"_.                                                                                                                                                                                                  |
| A7  | `InitiatingHeapOccupancyPercent` deprecated in 27, aliased to `G1IHOP`                               | **CONFIRMED, and more precise than stated**    | `jdk27/arguments.cpp`, under _"Deprecated alias flags"_: `{ "InitiatingHeapOccupancyPercent", jdk(27), jdk(28), jdk(29) }`, plus `aliased_jvm_flags`: `G1GC_ONLY({"InitiatingHeapOccupancyPercent" COMMA "G1IHOP" } COMMA)`. Both rows are **absent from `jdk-26-ga`** — new in 27. Full lifecycle: deprecated 27, obsolete 28, expires 29.                                                                                                                                                                                     |
| A8  | `jdk.OldObjectSample` unavailable under ZGC from 26                                                  | **WRONG**                                      | See top-line item 1. Correct: **JDK 27** (JDK-8382740), backported to **26.0.2** and **25.0.4**. Release note JDK-8386620.                                                                                                                                                                                                                                                                                                                                                                                                      |
| A9  | `InitialRAMPercentage`'s default removed in 26                                                       | **CONFIRMED with a correction to the wording** | See top-line item 2. Default changed `1.5625` → `0.0`; flag retained; initial heap now `MinHeapSize` (JDK-8371986 / JDK-8375501).                                                                                                                                                                                                                                                                                                                                                                                               |
| A10 | `UseCompressedClassPointers` deprecated 25, obsolete 27                                              | **CONFIRMED**                                  | `jdk-26-ga` and `jdk27` `arguments.cpp`: `#ifdef _LP64 { "UseCompressedClassPointers", jdk(25), jdk(27), undefined() }`. Executed on 25.0.4.1: _"Option UseCompressedClassPointers was deprecated in version 25.0 and will likely be removed in a future release."_ CSR JDK-8350754 (25).                                                                                                                                                                                                                                       |
| A11 | **Negative:** `sun.misc.Unsafe` `deny` did NOT become the default in 26, and 27 is frozen without it | **CONFIRMED**                                  | `src/java.base/share/man/java.md` on `jdk-26-ga`, `jdk27` **and `master`** all read: _"The default value when the option is not specified is `warn`."_ No JEP exists for the change: the chain stops at JEP 471 (Deprecate, JDK 23) and JEP 498 (Warn, JDK 24); a JBS sweep of `--sun-misc-unsafe-memory-access` returns no CSR or JEP flipping the default. `openjdk.org/projects/jdk/27/`: _"JDK 27 is in the Release Candidate phase. The overall feature set is frozen. No further JEPs will be targeted to this release."_ |

**Score: 9 confirmed, 1 wrong (A8), 1 confirmed-but-imprecisely-worded (A9). 0 unverifiable.**

---

## Part B — current status of the forward-looking projects

Status vocabulary is the JEP index's own: Draft → Submitted → Candidate → Proposed to Target →
Targeted → Integrated → Closed/Delivered.

### Valhalla

| JEP     | Title                                            | Status         | Release |
| ------- | ------------------------------------------------ | -------------- | ------- |
| 401     | Value Objects (Preview)                          | **Integrated** | **28**  |
| 539     | Strict Field Initialization in the JVM (Preview) | **Integrated** | **28**  |
| 402     | Enhanced Primitive Boxing (Preview)              | **Draft**      | none    |
| 8316779 | Null-Restricted Value Class Types (Preview)      | **Draft**      | none    |
| 8303099 | Null-Restricted and Nullable Types (Preview)     | **Draft**      | none    |
| 169     | Larval State for Value Objects                   | Draft          | none    |
| 218     | Generics over Primitive Types                    | Candidate      | none    |
| 8297236 | enhanced checkcast for Valhalla type unification | Draft          | none    |

**Nothing Valhalla has shipped, in any form, in JDK 26 or 27** — neither release's feature list
contains a Valhalla JEP. The first previewable bits are 401 and 539 on a **JDK 28 EA build**.

**Null-restricted types have no assigned JEP number and no release.** Both candidates
(8316779, 8303099) are Drafts. Any repository text implying a schedule for them is unsupportable.

### Leyden

| JEP     | Title                                    | Status               | Release |
| ------- | ---------------------------------------- | -------------------- | ------- |
| 483     | Ahead-of-Time Class Loading & Linking    | Closed/Delivered     | **24**  |
| 514     | Ahead-of-Time Command-Line Ergonomics    | Closed/Delivered     | **25**  |
| 515     | Ahead-of-Time Method Profiling           | Closed/Delivered     | **25**  |
| 516     | Ahead-of-Time Object Caching with Any GC | **Closed/Delivered** | **26**  |
| 8335368 | Ahead-of-Time Code Compilation           | Submitted            | none    |
| 8329758 | Faster Startup and Warmup with ZGC       | Submitted            | none    |

**Newest shipped Leyden JEP is 516, in JDK 26** (GA 2026-03-17). **Nothing Leyden is in JDK 27
or targeted to 28.** The two Submitted JEPs (AOT _code_ compilation — the actual endgame — and
ZGC startup) remain untargeted.

### Lilliput / compact object headers

| JEP     | Title                                 | Status               | Release                           |
| ------- | ------------------------------------- | -------------------- | --------------------------------- |
| 450     | Compact Object Headers (Experimental) | Closed/Delivered     | **24**                            |
| 519     | Compact Object Headers                | Closed/Delivered     | **25** (product, default `false`) |
| 534     | Compact Object Headers by Default     | **Closed/Delivered** | **27**                            |
| 8349069 | 4-byte Object Headers (Experimental)  | Draft                | none                              |

JEP 534 explicitly leaves the 96-bit layout in place: _"It is not a goal to remove the old 96-bit
object header layout at this time"_, disable with `-XX:-UseCompactObjectHeaders`. The next step
(4-byte headers) is a Draft.

### Generational ZGC

| JEP     | Title                                 | Status           | Release                               |
| ------- | ------------------------------------- | ---------------- | ------------------------------------- |
| 439     | Generational ZGC                      | Closed/Delivered | **21** (opt-in, `-XX:+ZGenerational`) |
| 474     | ZGC: Generational Mode by Default     | Closed/Delivered | **23**                                |
| 490     | ZGC: Remove the Non-Generational Mode | Closed/Delivered | **24**                                |
| 8377305 | Adaptive Heap Sizing for ZGC          | Submitted        | none                                  |

**The non-generational mode was removed in JDK 24 by JEP 490** — the question the brief asked to
verify. See top-line item 3 for the flag's actual behaviour, which differs by release in a way
one skill gets wrong.

### Generational Shenandoah

| JEP | Title                                       | Status           | Release                        |
| --- | ------------------------------------------- | ---------------- | ------------------------------ |
| 404 | Generational Shenandoah (Experimental)      | Closed/Delivered | **24**                         |
| 521 | Generational Shenandoah                     | Closed/Delivered | **25** (product, still opt-in) |
| 535 | Shenandoah GC: Generational Mode by Default | **Targeted**     | **28**                         |

JEP 404's long deferral history ended: it delivered in 24 as experimental, went product in 25 via
JEP 521, and JEP 535 (created 2026-03-10, Targeted 2026-08-04) makes generational the default in
**JDK 28**. It is on the JDK 28 project page. Not in 27.

### What changed between JDK 26 and JDK 27

Everything below is new in 27 and absent from JDK 26 GA. Verified in `jdk27` sources.

| Change                                                                                                                                                                                                                         | Source                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Compact object headers become the default                                                                                                                                                                                      | JEP 534                               |
| G1 selected in **all** environments, ending the Serial fallback                                                                                                                                                                | JEP 523                               |
| `LockingMode` expires — flag deleted, JVM refuses to start                                                                                                                                                                     | `arguments.cpp` entry removed         |
| `UseCompressedClassPointers` moves deprecated → obsolete                                                                                                                                                                       | `arguments.cpp`                       |
| `InitiatingHeapOccupancyPercent` deprecated and aliased to `G1IHOP`                                                                                                                                                            | `arguments.cpp` + `aliased_jvm_flags` |
| `MaxRAM`, `ParallelRefProcEnabled`, `ParallelRefProcBalancingEnabled`, `PSChunkLargeArrays`, `AggressiveHeap`, `NeverActAsServerClassMachine`, `AlwaysActAsServerClassMachine` move deprecated (26) → obsolete (27), expire 28 | `arguments.cpp`                       |
| ~18 `AdaptiveSize*` / `Tenured*` Parallel knobs expire (obsolete 26 → expired 27)                                                                                                                                              | `arguments.cpp`                       |
| New obsoletions: `NewSizeThreadIncrease`, `UseXMMForArrayCopy`, `UseNewLongLShift`, 7 `Shenandoah*` sampling knobs                                                                                                             | `arguments.cpp`                       |
| `jdk.OldObjectSample` disabled under generational ZGC                                                                                                                                                                          | JDK-8382740 (also in 26.0.2, 25.0.4)  |
| Vector API twelfth incubator                                                                                                                                                                                                   | JEP 537                               |

**Not** in JDK 27, despite being plausible: any Valhalla JEP, any Leyden JEP, `sun.misc.Unsafe`
`deny`, generational Shenandoah by default (28), 4-byte headers.

---

## Part C — repository sweep

**Nothing below was edited.** 109 hits across the target terms; false positives (`value object`
in the DDD/enterprise-pattern sense, `serialise`/`deserialise` matching `Serial`) were dropped.
Rows are ordered worst-first.

### C.1 — Wrong, or wrong as written

| #   | File : line                                                            | Claim as written                                                                                                                                                    | Verdict                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `skills/java-reference-types-and-leaks/references/leak-patterns.md:22` | "**It is unavailable under ZGC from JDK 26** (JDK-8382740) — the event is disabled there because the weak-handle implementation costs too much in generational ZGC" | **FALSE (scope).** JDK-8382740 is fixVersion **27**; backported to **26.0.2**, **25.0.4**, 25.0.4-oracle (release note JDK-8386620). Unaffected: 26.0.0/26.0.1. Affected but excluded by the current wording: **the repo's own JDK 25 baseline from 25.0.4**. The mechanism half of the sentence is correct.             |
| 2   | `skills/zgc-generational-internals/SKILL.md:57`                        | "Never prescribe `-XX:+ZGenerational`. Removed by JEP 490 (JDK 24); the flag is **accepted silently and does nothing**."                                            | **FALSE.** Measured on Temurin 25.0.4.1: it warns (`Ignoring option ZGenerational; support was removed in 24.0`), not silent. Source-derived for 26/27: absent from `special_jvm_flags` and `z_globals.hpp` on `jdk-26-ga`/`jdk27` → **JVM refuses to start**. Contradicted by `flag-lifecycle.md:43` in this same repo. |
| 3   | `skills/startup-cds-crac-leyden/SKILL.md:61`                           | "**JEP 516 is only a candidate at this baseline**; do not plan adoption on it."                                                                                     | **FALSE as a status claim.** JEP 516 is _Closed/Delivered, Release 26_ — shipped 2026-03-17. "At this baseline" (JDK 25) makes the sentence half-defensible, but a reader takes "only a candidate" as the JEP's current status, and the advice not to plan adoption is now wrong for anyone on 26+.                      |

### C.2 — Needs version scope (true today, or true only on a stated baseline)

| #   | File : line                                                                                                                                 | Claim as written                                                                                                                             | Verdict                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | `skills/jvm-performance-review/references/flag-cost-and-defaults.md:255`                                                                    | table row `\| 27 \| **Default `true`** (JEP 534) — scheduled, not yet shipped \|`                                                            | **NEEDS-VERSION-SCOPE — dated.** True on 2026-08-28; **false from 2026-09-15** (JDK 27 GA). JEP 534 is already Closed/Delivered; only GA is pending.                                                                                                                                                                                                      |
| 5   | `skills/jvm-performance-review/references/container-arithmetic.md:150`                                                                      | "**JDK 27 (RC, GA scheduled 2026-09-15):** G1 becomes the default in all environments (JEP 523) … Scheduled, not observed."                  | **NEEDS-VERSION-SCOPE — dated.** Same 2026-09-15 expiry. Best-written instance of the pattern (it names the GA date), so it self-documents; still needs the sweep after GA.                                                                                                                                                                               |
| 6   | `skills/jvm-performance-review/references/flag-cost-and-defaults.md:197`                                                                    | "JEP 523 changes this: from **JDK 27** … treat that as scheduled behaviour, not observed."                                                   | **NEEDS-VERSION-SCOPE — dated.** Same expiry.                                                                                                                                                                                                                                                                                                             |
| 7   | `skills/jvm-performance-review/references/flag-lifecycle.md:5`                                                                              | "Everything here is scoped to JDK 21, 25 and 26; where JDK 27 is scheduled to change the answer it is marked as scheduled, not as observed." | **NEEDS-VERSION-SCOPE.** The scoping discipline is exemplary and every row I checked is correct. It becomes a JDK-27-shaped gap on 2026-09-15 rather than a falsehood.                                                                                                                                                                                    |
| 8   | `skills/lock-inflation/references/measuring-contention.md:6-11`, `skills/lock-inflation/SKILL.md:35`                                        | `java -XX:+PrintFlagsFinal -version \| grep LockingMode` / "`2` (`LM_LIGHTWEIGHT`) is the JDK 25 default"                                    | **NEEDS-VERSION-SCOPE.** Correct on 25 (verified: `LockingMode` present in `jdk-25-ga/runtime/globals.hpp`). On **26 and 27 the grep returns nothing** — the flag is gone from `globals.hpp`. The diagnostic silently degrades to a false negative rather than erroring.                                                                                  |
| 9   | `skills/zgc-and-shenandoah/references/flags-and-modes.md:15`                                                                                | "\| Generational Shenandoah \| 521 \| **Product, still not default** \| 25 \|"                                                               | **NEEDS-VERSION-SCOPE.** True through 27. JEP 535 (Targeted, **JDK 28**) makes it the default; the table has no row for it, unlike `epsilon-and-shenandoah-internals` which does.                                                                                                                                                                         |
| 10  | `skills/gc-fundamentals/SKILL.md:67`, `skills/gc-fundamentals/references/collector-mechanisms.md:68`, `skills/jvm-gc-tuning/SKILL.md:64-65` | "generational Shenandoah is product (JEP 521)"                                                                                               | **UNDATED-BUT-TRUE.** Accurate; missing the JEP 535 / JDK 28 default flip.                                                                                                                                                                                                                                                                                |
| 11  | `skills/gc-fundamentals/references/collector-mechanisms.md:66`, `skills/jvm-gc-tuning/SKILL.md:64`                                          | "`-XX:+ZGenerational` **does not exist** any more (JEP 490, JDK 24)"                                                                         | **UNDATED-BUT-TRUE**, but should carry the 26+ _refuses to start_ consequence (see C.1 #2) — "does not exist" reads as harmless.                                                                                                                                                                                                                          |
| 12  | `skills/jvm-gc-tuning/references/collector-and-heap.md:14`                                                                                  | selection table row "\| Serial \| Small containers, single core, short-lived processes \|"                                                   | **NEEDS-VERSION-SCOPE (soft).** The paragraph at :16-19 correctly states JEP 523 kills the _default_, but the recommendation row still points at Serial for exactly the case JEP 523's rationale rebuts: _"G1 is now competitive with Serial at all heap sizes"_ and _"we have reduced G1's native memory usage to levels comparable to that of Serial."_ |
| 13  | `skills/jvm-performance-review/references/missing-measurements.md:139-146`, `skills/java-reference-types-and-leaks/SKILL.md:36`             | `jfr view memory-leaks-by-site app.jfr # jdk.OldObjectSample` recommended with no collector caveat                                           | **NEEDS-VERSION-SCOPE.** The ZGC caveat lives in exactly one file (`leak-patterns.md`) and does not reach the workflow that actually issues the command. Under ZGC on 25.0.4+/26.0.2+/27 this produces an empty view with no error — the same silent-empty-result failure mode the `unified-logging` work was built to prevent.                           |

### C.3 — Verified correct (no action)

| #   | File : line                                                                                                                                                                                                                                                                  | Claim                                                                                                                        | Verdict                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | `skills/escape-analysis-internals/SKILL.md:90-94`                                                                                                                                                                                                                            | JEP 401 + 539 Integrated for JDK 28, previewable only on a 28 EA build, not 25/26/27; JEP 402 a Draft with no target release | **TRUE** — matches the JEP headers verbatim. The most accurate Valhalla statement in the repo.                                           |
| 15  | `skills/epsilon-and-shenandoah-internals/SKILL.md:71,77`                                                                                                                                                                                                                     | JEP 404 experimental 24 → JEP 521 product 25 → **JEP 535 (Targeted, JDK 28)** makes it default                               | **TRUE** — the only place in the repo carrying JEP 535.                                                                                  |
| 16  | `skills/g1-tuning-for-slo/references/flags-and-baselines.md:31-33`                                                                                                                                                                                                           | `InitiatingHeapOccupancyPercent` deprecated from 27, aliased to `G1IHOP`, obsolete 28, expires 29                            | **TRUE** — matches `jdk27/arguments.cpp` exactly, including the 28/29 numbers.                                                           |
| 17  | `skills/g1-concurrent-marking/SKILL.md:57`, `references/marking-cycle-log-and-flags.md:105`                                                                                                                                                                                  | same IHOP/G1IHOP claim                                                                                                       | **TRUE.**                                                                                                                                |
| 18  | `skills/metaspace-internals/SKILL.md:69-71`, `references/sizing-and-flags.md:14`                                                                                                                                                                                             | `UseCompressedClassPointers` deprecated JDK 25, obsolete JDK 27                                                              | **TRUE** — source + executed on 25.0.4.1.                                                                                                |
| 19  | `skills/jvm-performance-review/references/flag-lifecycle.md:43`                                                                                                                                                                                                              | `ZGenerational` row: dep 23 / obs 24 / dropped 26; JDK 25 "starts, warns, value ignored"; JDK 26 "**refuses to start**"      | **TRUE** — and the correct version of C.1 #2.                                                                                            |
| 20  | `skills/jvm-performance-review/references/flag-lifecycle.md:83-84`                                                                                                                                                                                                           | ZGC timeline 21 (JEP 439) → 23 default (JEP 474) → 24 non-generational removed (JEP 490)                                     | **TRUE.**                                                                                                                                |
| 21  | `skills/jvm-performance-review/references/container-arithmetic.md:147-148`                                                                                                                                                                                                   | "JDK 26: the 128 GB `MaxRAM` cap is removed and `InitialRAMPercentage` defaults to 0.0"                                      | **TRUE** — the most precise statement of A9/A-MaxRAM anywhere in the repo; correctly separates the two changes.                          |
| 22  | `skills/jni-and-ffm/SKILL.md:78`, `references/pinning-and-native-access.md:115`                                                                                                                                                                                              | "the JEP states an intent to make `deny` the default in a future release … that release has no publicly announced date"      | **TRUE** — confirms A11 independently. `warn` is still the default on `master` (JDK 28).                                                 |
| 23  | `skills/cpu-cache-and-numa/SKILL.md:56-57`, `skills/false-sharing-and-contended/SKILL.md:84-85` and `references/contended-mechanics.md:40-50`, `skills/heap-dump-analysis/SKILL.md:91-92` and `references/capture-recipes.md:69`, `skills/jvm-memory-regions/SKILL.md:62-63` | compact headers "off by default through JDK 26 and on by default from JDK 27" (JEP 519 / JEP 534)                            | **TRUE** — five skills, consistent wording, all correct.                                                                                 |
| 24  | `skills/jvm-performance-review/references/flag-cost-and-defaults.md:252-253`, `flag-lifecycle.md:130`                                                                                                                                                                        | JEP 450 experimental 24 (needs unlock) → JEP 519 product 25, default `false`, no unlock                                      | **TRUE.**                                                                                                                                |
| 25  | `skills/gc-fundamentals/SKILL.md:69`, `skills/jvm-gc-tuning/references/collector-and-heap.md:16-19`                                                                                                                                                                          | "From JDK 27 (JEP 523) the JVM always selects G1 when no collector is named"                                                 | **TRUE.**                                                                                                                                |
| 26  | `skills/startup-cds-crac-leyden/SKILL.md:59-60`, `skills/jvm-class-loading/references/startup-and-aot-cache.md:20-21`, `skills/jit-compilation/SKILL.md:74`                                                                                                                  | JEP 483 Delivered JDK 24 (not preview); JEP 514 + 515 Delivered JDK 25                                                       | **TRUE.**                                                                                                                                |
| 27  | `skills/zgc-and-shenandoah/SKILL.md:58-60,77`, `references/flags-and-modes.md:11,14`, `skills/zgc-generational-internals/SKILL.md:58-59,77` and `references/*`                                                                                                               | ZGC generational timeline; multi-mapping removed with the non-generational mode in 24                                        | **TRUE.**                                                                                                                                |
| 28  | `skills/simd-and-vector-api/SKILL.md:64`, `references/when-to-vectorise.md:115`                                                                                                                                                                                              | Vector API finalisation depends on Valhalla; no version can be promised; incubator rounds 508/25, 529/26, 537/27             | **TRUE** — round-to-release mapping matches the JEP index; JDK 27's feature list confirms 537.                                           |
| 29  | `skills/lock-inflation/references/monitor-lifecycle.md:119`                                                                                                                                                                                                                  | "\| `-XX:LockingMode` removed entirely \| JDK 27 \| `globals.hpp` \|"                                                        | **TRUE** — including the cited file: `LockingMode` count in `runtime/globals.hpp` is 2 on `jdk-25-ga`, **0** on `jdk-26-ga` and `jdk27`. |
| 30  | `skills/virtual-threads-internals/SKILL.md:84` and `references/continuation-mechanics.md:80-81`, `skills/queueing-models/references/measuring-the-parameters.md:69-70`, `skills/container-awareness/references/sizing-heap-and-cpu.md:40`                                    | generational ZGC default since 23 (JEP 474); generational Shenandoah product since 25 (JEP 521)                              | **TRUE.**                                                                                                                                |

### C.4 — Coverage gaps (not false claims)

| #   | Where                               | Gap                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 31  | `skills/startup-cds-crac-leyden/**` | Leyden coverage stops at JEP 483/514/515 (JDK 24–25). **JEP 516 (AOT object caching with any GC, Delivered JDK 26)** appears once in the whole repo, and only to dismiss it as a candidate (C.1 #3). On JDK 26+ the AOT cache no longer requires a specific collector — a real change to the adoption calculus that the skill does not reflect. |
| 32  | repo-wide                           | No skill mentions the two **Submitted** Leyden JEPs (8335368 AOT _code_ compilation, 8329758 faster startup with ZGC), nor the Submitted 8377305 (Adaptive Heap Sizing for ZGC) or the Draft 8349069 (4-byte object headers). Absence is defensible for untargeted work; noted so it is a decision, not an oversight.                           |
| 33  | repo-wide                           | **No skill mentions null-restricted types at all** — neither 8316779 nor 8303099. Given both are Drafts with no release, this is the correct state. Recorded so a future pass does not "fill the gap" with a schedule that does not exist.                                                                                                      |

### C.5 — Non-findings, recorded to close them out

- **`JEP 493`** (Linking Run-Time Images without JMODs, Closed/Delivered JDK 24): **zero hits**
  under `skills/`. Consistent with the prior record's note that the `jlink` skill was dropped.
- **`primitive class`**: zero hits. The repo consistently uses "value object"/"value class" only
  where correct.
- `skills/java-reference-types-and-leaks/references/reachability-and-cleaners.md:39` — "the common
  accident of an inner **value class** holding the key object" — a `WeakHashMap` discussion where
  "value class" means _the class of the map's value_. Terminology collision with Valhalla's
  `value class`, not a false claim. NIT only.
- The `value object` hits in `enterprise-base-patterns`, `data-source-patterns`,
  `enterprise-architecture-smells` and `component-and-release-boundaries` are DDD usage,
  unrelated to JEP 401.

---

## Method limits

- **No JDK 21, 26, 27 or 28 is installed.** Every claim about those releases is derived from JEP
  pages, JBS, and pinned `openjdk/jdk` sources. Executed evidence exists only for Temurin 25.0.3
  and 25.0.4.1 on Windows x64, and is labelled inline where used.
- The `jdk27` branch is a stabilisation branch under the JEP 3 fix-request process. Its
  `arguments.cpp` reflects JDK 27 as it stands 18 days before GA; a critical bug fix could still
  move a flag, though not a JEP.
- The `jdk.OldObjectSample` differential run confirms the operational advice but **not** the
  release scoping — see top-line item 1. The scoping rests on JBS fixVersions alone.
- `master` was read as a proxy for JDK 28 in flight. Its feature set is not frozen; the only
  claim drawn from it is the `sun.misc.Unsafe` default (`warn`), which is a negative result and
  can still change before JDK 28.
- **Two rows in C.2 expire on 2026-09-15** (JDK 27 GA) without anyone touching the repository.
  They are correct today and become stale that morning.
