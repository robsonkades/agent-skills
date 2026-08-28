# Validation report — `jvm-performance-review`

Independent adversarial validation. The validator did not write this skill.

**Method.** Every file read. The research brief's §F UNRESOLVED read first. All lifecycle and
default claims that could be executed were executed on **Temurin 25.0.3+9 (LTS), Windows x64,
24 logical CPUs, ~32 GiB RAM**. JDK 26 claims checked against `jdk-26-ga` source
(`arguments.cpp`, `gc_globals.hpp`) fetched at validation time; JDK 21 claims not
independently re-verified (no JDK 21 available). Package validated with the repo's own
`agent-skills validate`.

Counts: **1 BLOCKER, 3 MAJOR, 7 MINOR, 5 NIT.**

---

## BLOCKER

### B1. The quota→`ActiveProcessorCount` formula computes `0` for the exact case the skill calls P2

**File:** `references/container-arithmetic.md`, lines 24–28.

```text
host_cpus   = active_processor_count()        # sched_getaffinity
quota_count = ceil(cpu_quota / cpu_period)    # only when quota > -1 and period > 0
ActiveProcessorCount = min(host_cpus, quota_count)
```

**What is wrong.** The real code initialises the limit to `host_cpus` and only overwrites it
when a quota exists. The skill dropped that initialisation, so when there is no
`limits.cpu` — `quota == -1`, `quota_count` never assigned, i.e. `0` — the third line
evaluates `min(host_cpus, 0) = 0`. Read literally, the skill's own derivation says a pod with
`requests.cpu` and no `limits.cpu` gets **zero** processors. That is the single case the same
file (line 17, and consequence 2 at lines 38–42) correctly calls out as the highest-value
container finding in the skill. The formula and the prose two lines below it disagree, and the
formula is the part that gets transcribed into a finding.

**Evidence.** `jdk-25-ga` `src/hotspot/os/linux/cgroupUtil_linux.cpp`,
`CgroupUtil::processor_count` (quoted in full in the brief, §E.2):

```c
int limit_count = host_cpus;                       // <- the missing line
if (quota > -1 && period > 0) quota_count = ceilf((float)quota / (float)period);
if (quota_count != 0) limit_count = quota_count;
return MIN2(host_cpus, limit_count);
```

**Fix.** Replace the block with:

```text
host_cpus   = sched_getaffinity count
limit_count = host_cpus                       # <- default when there is no quota
if cpu_quota > -1 and cpu_period > 0:
    quota_count = ceil(cpu_quota / cpu_period)
    if quota_count != 0: limit_count = quota_count
ActiveProcessorCount = min(host_cpus, limit_count)
```

The two consequences below it stay as written; they are both correct.

---

## MAJOR

### M1. `-Xlog:gc+heap+coops=info` produces no output — it is the falsifier for the skill's one worked example

**Files:** `SKILL.md` line 111 (inside the worked example's `Recommendation:`);
`references/flag-cost-and-defaults.md` line 58.

**What is wrong.** The `gc+heap+coops` messages are emitted at `debug` and `trace`, not
`info`. An auditor who follows the skill's instruction runs the command, sees nothing, and has
no way to tell "compressed oops are on" from "I ran the wrong command".

**Evidence** (executed on 25.0.3):

```
$ java -Xlog:gc+heap+coops=info -version
openjdk version "25.0.3" ...                      # <- no coops line at all

$ java -Xlog:gc+heap+coops=trace T.java
[0.005s][trace][gc,heap,coops] Trying to allocate at address 0x0000000604000000 heap of size 0x1fc000000
[0.005s][debug][gc,heap,coops] Heap address: 0x0000000604000000, size: 8128 MB, Compressed Oops mode: Zero based, Oop shift amount: 3
```

**Fix.** Use `-Xlog:gc+heap+coops=debug`. A cheaper alternative that _is_ at `info` and states
the answer in one word — worth naming instead, since the skill's rule is "one named command
with a named discriminator":

```
$ java -XX:MaxRAM=500g -Xlog:gc+init T.java | grep -i compressed
[0.014s][info][gc,init] Compressed Oops: Disabled
```

### M2. The coops-disabled message is not reachable through `-Xlog:aot`; it appears under `cds`

**File:** `references/flag-cost-and-defaults.md` line 55 — "On JDK 25 the message is logged
under the `aot` tag, which makes it easy to miss."

**What is wrong.** The source calls `aot_log_info(aot)(...)`, but on a normal (non-AOT) run
that macro resolves to the **`cds`** tag. An auditor told to look under `aot` runs
`-Xlog:aot=info` and finds nothing, then reports the message absent — the opposite of the
skill's intent.

**Evidence** (executed on 25.0.3, with `-XX:MaxRAM=500g` to force the branch):

```
$ java -XX:MaxRAM=500g -Xlog:aot=info T.java | grep -ci "have been disabled"
0

$ java -XX:MaxRAM=500g -Xlog:cds=info T.java | grep "have been disabled"
[0.002s][info][cds] UseCompressedOops and UseCompressedClassPointers have been disabled due to
max heap 134217728000 > compressed oop heap 32178700288. Please check the setting of MaxRAMPercentage 25.00.
```

Source: `jdk-25-ga arguments.cpp` L1578 (`aot_log_info(aot)`), confirming the brief read the
macro name rather than the observed tag.

**Fix.** "On JDK 25 the message is emitted through the AOT logging macro, which resolves to
the **`cds`** tag on a normal run — `-Xlog:cds=info`, not `-Xlog:aot`."

### M3. The worked example's `Kills it:` names the wrong falsifier, and misses the one that actually fires

**File:** `SKILL.md` lines 118–120.

```
Confirms it:    usesCompressedOops = false in jdk.GCHeapConfiguration.
Kills it:       usesCompressedOops = true — a cgroup memory limit below the
                compressed-oops range was in effect and the heap never crossed it.
```

**What is wrong.** The disable branch is guarded by `FLAG_IS_ERGO(UseCompressedOops)`. If
`-XX:+UseCompressedOops` is anywhere on the line — common in inherited JDK-8-era configs — the
JVM takes the _other_ branch: it keeps compressed oops and **silently caps the heap at ~32 GB**
instead. So `usesCompressedOops = true` does **not** imply "a memory limit was in effect";
it more often means "someone pinned the flag, and your `MaxRAMPercentage=85` bought you 30 GB,
not 108". The skill's stated interpretation would send the auditor to look for a cgroup limit
that isn't there, and would hide a second, equally reportable P2 finding.

**Evidence** (executed on 25.0.3):

```
$ java -XX:MaxRAM=500g -XX:+PrintFlagsFinal -version | grep -E "MaxHeapSize|UseCompressedOops"
   size_t MaxHeapSize      = 134217728000   {ergonomic}
     bool UseCompressedOops = false         {ergonomic}      # disable branch

$ java -XX:MaxRAM=500g -XX:+UseCompressedOops -XX:+PrintFlagsFinal -version | grep -E "MaxHeapSize|UseCompressedOops"
   size_t MaxHeapSize      = 32178700288    {ergonomic}      # cap branch — heap silently truncated
     bool UseCompressedOops = true          {command line}
```

Source: `jdk-25-ga arguments.cpp` L1576–L1585.

**Fix.** Add the guard to the `Inference:` line ("…when compressed oops were chosen
ergonomically") and split the falsifier:

```
Kills it:       usesCompressedOops = true. Two causes, and they are different findings:
                an explicit -XX:+UseCompressedOops on the line (the heap was capped at
                ~32 GB instead — report that), or a memory limit below the range.
```

---

## MINOR

### m1. "ZGC forces `UseNUMA` true" is asserted without the platform qualifier that makes it observable

`references/flag-cost-and-defaults.md` line 76 and the defaults table at line 274. The shared
`zArguments.cpp` does `FLAG_SET_DEFAULT(UseNUMA, true)`, but platform code can clear it
afterwards, and on this machine it does — even when set explicitly:

```
$ java -XX:+UseZGC -XX:+PrintFlagsFinal -version | grep -E "UseZGC|UseNUMA "
     bool UseNUMA = false {product} {default}
     bool UseZGC  = true  {product} {command line}

$ java -XX:+UseZGC -XX:+UseNUMA -XX:+PrintFlagsFinal -version | grep "UseNUMA "
     bool UseNUMA = false {product} {command line}
```

The conclusion the skill draws — `-XX:+UseNUMA` next to `-XX:+UseZGC` is noise — is correct
either way. But an auditor holding a `VM.flags` dump showing `UseNUMA=false` under ZGC will
think the artefact contradicts the skill. Fix: say "ZGC requests `UseNUMA` by default; the
platform may still self-disable it (§UseNUMA), so read the value rather than assuming it."

### m2. The workflow has no entry branch for the no-artefact request the gate exists to catch

`SKILL.md` lines 47–73. Steps 1–5 all presuppose a supplied artefact; step 6 ("Apply the gate.
For every change you are about to propose…") is phrased as a per-change filter and is only
reachable once you have changes. For "give me flags to fix our p99" with nothing attached, the
numbered procedure has no defined entry. The gate itself is **not** decorative — the "The gate"
section (lines 31–45) names that exact prompt, states the correct output, and explicitly
forbids a following flag list ("there is no flag list after it"), and the References block
routes `missing-measurements.md` on "whenever the request is for flags rather than for a
review". So the gate holds. But it holds because of prose above the workflow rather than
because of the workflow. Fix: make it step 0 — "**If no artefact was supplied**, the audit
cannot start. Go to `references/missing-measurements.md`, emit the refusal, and stop."

### m3. `-XX:+IgnoreUnrecognizedVMOptions` is explained twice

`SKILL.md` step 2 (lines 54–58) and `references/flag-lifecycle.md` lines 24–27 give the same
explanation in the same words. House standard, `anti-patterns.md`: "Duplicated knowledge …
One home per fact." Fix: the reference should cross-reference step 2 rather than restate it.

### m4. Pre-JDK-9 GC-logging flags are owned by `unified-logging`, which is not in the exclusion list

`references/flag-lifecycle.md` line 40 (table row) and lines 109–114 (the "mixed trap"
section) restate material that `skills/unified-logging/references/legacy-flags.md` already
covers with executed verification — and `gc-log-analysis`'s own description assigns "migrating
pre-JDK-9 flags" to `unified-logging` explicitly. The `jvm-performance-review` description
excludes seven neighbours but not that one.

There is also a confidence divergence: `unified-logging/references/legacy-flags.md` line 41
says these were "**removed before JDK 21** — exact release not established", where
`flag-lifecycle.md` says "removed in 9". I checked `jdk-9+181` and `jdk-10+46` `arguments.cpp`:
neither contains a `PrintGCTimeStamps` / `UseGCLogFileRotation` / `NumberOfGCLogFiles` entry,
so they never entered `special_jvm_flags` and were deleted outright in 9 — **this skill is the
more accurate of the two.** Fix: keep the row (an auditor needs the JDK 21/25/26 column in
place), cut the six-line prose section down to a pointer, and add `unified-logging` to the
description's exclusions. Note the description is at 1014/1024 bytes — something must go to
make room (see n4).

### m5. `MaxRAMPercentage=90` is claimed by two skills with no boundary stated

`container-awareness/SKILL.md` line 84 treats it as a sizing bug ("60–70% is a starting
point"); `flag-cost-and-defaults.md` treats it as a compressed-oops hazard. These are
complementary, not contradictory, and the split is defensible — **this skill should own the
compressed-oops mechanism** (it is a flag-lifecycle fact), `container-awareness` should own the
sizing decision. But neither says so. Worth one clause in this skill's `MaxRAMPercentage`
section: "the sizing question — what percentage — belongs to `container-awareness`; this
section is only about what the flag being set at all does to compressed oops."

No actual contradiction found between the two. I specifically checked the sharpest risk:
`container-awareness` rules that `ActiveProcessorCount` must never be read from
`PrintFlagsFinal`/`VM.flags` because of the `-1` sentinel. Verified true —

```
$ java -XX:+PrintFlagsFinal -version | grep ActiveProcessorCount
      int ActiveProcessorCount = -1 {product} {default}
```

— and `jvm-performance-review` never tells anyone to do that; it routes to
`-Xlog:os+container=trace`, `-XshowSettings:system` and `jfr view container-configuration`
throughout. Consistent.

### m6. GC-pause p99 and request-latency p99 are different populations

`references/missing-measurements.md` lines 46–49: "p99 of `GCPhasePause` comparable to the
regression → GC pause." The safe direction (both small → not the pause machinery) is stated
correctly and is the one that matters. The unsafe direction over-attributes: a request can
absorb several pauses, and the p99 of a pause distribution is not the p99 pause contribution to
a request. Fix: one clause — "comparable _and_ time-correlated with the spike window; a pause
p99 alone does not establish that the slow requests are the ones that were paused."

### m7. Not in `registry/skills.yaml`

`npm run registry:build` / `registry:check` currently abort on an unrelated broken package
(`skills/concurrent-collections-and-synchronizers` has no `skill.yaml`), so this is not this
package's fault — but `npm run verify` will fail until it is regenerated. Flagging so it is
not mistaken for a defect in this skill.

---

## NIT

- **n1.** `references/flag-lifecycle.md` line 40 puts "removed in 9" in the **Deprecated**
  column, with Obsolete and Expired blank. These flags were never in `special_jvm_flags`;
  "n/a — deleted in 9" belongs in the Expired column.
- **n2.** `references/flag-lifecycle.md` line 49 labels the 18 JDK 26 obsoletions
  "`AdaptiveSize*` / `Tenured*` / `PretenureSizeThreshold` / `HeapMaximumCompactionInterval`".
  The actual set (counted at `jdk-26-ga`: exactly 18) also includes `PausePadding`,
  `SurvivorPadding`, `UseAdaptiveGenerationSizePolicyAt{Major,Minor}Collection`,
  `UseAdaptiveSizeDecayMajorGCCost`, `UseAdaptiveSizePolicy{FootprintGoal,WithSystemGC}` and
  `UsePSAdaptiveSurvivorSizePolicy` — none of which match those prefixes. Add "and the
  Parallel survivor/padding knobs" so a match is not missed.
- **n3.** 1792 is written as "MB" in `container-arithmetic.md` line 18 and
  `flag-cost-and-defaults.md` line 184, and "MiB" at line 190. The source is
  `2UL * G - 256UL * M`, i.e. binary: MiB throughout.
- **n4.** The description is 1014 bytes — 10 bytes below the 1024 limit, byte-identical between
  `SKILL.md` and `skill.yaml` (verified). Any addition (m4) overflows it.
- **n5.** `container-arithmetic.md` line 25 defines `host_cpus = active_processor_count()`
  while line 27 defines `ActiveProcessorCount` — the same name at two levels. Call line 25
  `affinity_cpus`.

---

## What I tried to break and could not

Everything below was verified by execution on Temurin 25.0.3 unless marked otherwise, and
held up exactly as written.

**Lifecycle matrix — every row I could run.** All fifteen "refuses to start" flags refuse to
start with `Unrecognized VM option` and exit 1: `UseConcMarkSweepGC`,
`CMSInitiatingOccupancyFraction`, `UseParallelOldGC` (with the "Did you mean UseParallelGC?"
fuzzy match that makes the error look unrelated to the collector, exactly as the skill warns),
`UseBiasedLocking`, `MaxPermSize`, `AggressiveOpts`, `UseParNewGC`,
`UseCGroupMemoryLimitForHeap`, `PrintGCTimeStamps`, `PrintGCDateStamps`,
`UseGCLogFileRotation`, `NumberOfGCLogFiles`, `GCLogFileSize`, `UseContainerCpuShares`,
`PreferContainerQuotaForCPUCount`. The warn/ignore rows are exact to the message text:
`ZGenerational` → `Ignoring option ZGenerational; support was removed in 24.0`;
`LockingMode` → deprecation warning **and still effective** (`LockingMode = 1 {command line}`
in `PrintFlagsFinal`); `UseCompressedClassPointers` → `deprecated in version 25.0`;
`PrintGCDetails`/`PrintGC`/`-Xloggc:` → warn and rewrite to `-Xlog:`; `-Xverify:none` and
`-Xdebug` → warn.

**`-XX:+IgnoreUnrecognizedVMOptions`.** `java -XX:+IgnoreUnrecognizedVMOptions
-XX:+UseConcMarkSweepGC -XX:CMSInitiatingOccupancyFraction=70 -version` starts with **no
message of any kind** and exit 0. The skill's decision to make this step 2 rather than step 3
is correct and the reasoning behind it is exactly right.

**The folklore corrections — all six checkable ones hold.**

- Biased locking accepted through JDK 18, gone from the table in 19 — brief's source citations
  at `jdk-18+37` confirm `{ jdk(15), jdk(18), jdk(19) }`; the "removed in 15" folklore is
  indeed wrong on both counts.
- `ParallelRefProcEnabled` is already the ergonomic default when `ParallelGCThreads > 1`, and
  is _not_ set when it is 1 — proven directly:
  `java -XX:+PrintFlagsFinal` → `ParallelRefProcEnabled = true`; with
  `-XX:ParallelGCThreads=1` → `false`. Deprecated in 26 confirmed in `jdk-26-ga arguments.cpp`:
  `{ "ParallelRefProcEnabled", jdk(26), jdk(27), jdk(28) }`.
- CPU shares no longer affect the count, `UseContainerCpuShares` /
  `PreferContainerQuotaForCPUCount` expired in 21 — both refuse to start here.
- `ceil` not `floor`: `1500m` → `ceil(150000/100000) = 2`; `100m` → `1`. Arithmetic correct.
- Requests-without-limits hands the JVM the whole host: correct in the prose and the table
  (the code block is B1).
- `MaxRAMPercentage` disables compressed oops rather than capping the heap — reproduced above
  in M3: `MaxHeapSize = 134 GB` with `UseCompressedOops = false {ergonomic}`. The skill's
  worked-example arithmetic (128 Gi × 0.85 ≈ 108 GB, against a ~32 GB range) is right; the
  observed range on this build is 32178700288 bytes.
- `-XX:+UseNUMA` self-disabling on single-node Linux, and the claim that reporting it as
  dangerous is a false positive: source-verified in the brief (`os_linux.cpp` L4463–L4473),
  not executable here. See m1 for the one qualifier.

**Every ergonomic default in `flag-cost-and-defaults.md` Part 2.** On 24 CPUs:
`ParallelGCThreads = 18` = `8 + (24−8)×5/8` ✓; `ConcGCThreads = 5` = `max((18+2)/4, 1)` ✓;
`G1ConcRefinementThreads = 18` = `ParallelGCThreads` ✓; with `-XX:+UseZGC`,
`ParallelGCThreads = 15` = `ceil(24×0.60)` and `ConcGCThreads = 6` = `ceil(24×0.25)` ✓.
`MaxRAM = 137438953472` (128 GB) ✓, `MaxRAMPercentage 25.0` ✓, `MinRAMPercentage 50.0` ✓,
`InitialRAMPercentage 1.5625` ✓, `GCTimeRatio 12` (≈7.7%, "roughly 8%") ✓,
`ObjectAlignmentInBytes 8` ✓, `UseGCOverheadLimit true` with `GCTimeLimit 98` /
`GCHeapFreeLimit 2` ✓, `AlwaysPreTouch false` ✓, `DisableExplicitGC` /
`ExplicitGCInvokesConcurrent` both `false` ✓, `NativeMemoryTracking off` ✓,
`ThreadStackSize 0` on Windows ("system default") ✓, `TrimNativeHeapInterval` present on 25 ✓.

**Ergonomic collector selection.** `-XX:ActiveProcessorCount=1` → `UseSerialGC = true
{ergonomic}`; `=2` and `=4` → `UseG1GC {ergonomic}`. The "small pod silently gets Serial"
finding is real. Clause 3 of `is_server_class_machine` is quoted correctly — I pulled
`jdk-25-ga os.cpp` L1927–L1960 and the hyper-threading divisor is exactly as described; it
simply did not fire on this CPU, which is consistent with the skill's "can" phrasing.

**Code cache under `TieredStopAtLevel=1`.** I expected this to be the error — the skill
attributes a 240→48 MB `ReservedCodeCacheSize` drop to `TieredStopAtLevel=1`, which does not
disable tiered compilation. It is nonetheless correct: `-XX:TieredStopAtLevel=1` gives
`ReservedCodeCacheSize = 50331648` and `SegmentedCodeCache = false` while `TieredCompilation`
stays `true`. Identical to `-XX:-TieredCompilation`.

**`AlwaysPreTouch` scales with `-Xms`, not `-Xmx`.** Timed `java -version` startup:
`-Xms512m -Xmx6g` 55 ms → `+AlwaysPreTouch` 116 ms; `-Xms4g -Xmx6g +AlwaysPreTouch` 484 ms;
`-Xms4g -Xmx4g +AlwaysPreTouch` 441 ms. Cost tracks `-Xms` and is insensitive to `-Xmx`,
exactly as claimed — and the skill correctly refuses to turn this into a published number.

**Hard failures and forced values.** `-XX:ParallelGCThreads=0` with G1 →
`The flag -XX:+UseG1GC can not be combined with -XX:ParallelGCThreads=0`; same for ZGC ✓.
`-XX:+UseCompactObjectHeaders -XX:LockingMode=1` → `LockingMode = 2` ✓.
`-XX:+UseCompactObjectHeaders -XX:-UseCompressedClassPointers` →
`Compact object headers require compressed class pointers. Disabling compact object headers.` ✓.
`-XX:+UseEpsilonGC` without the unlock → experimental-gate error ✓. `UseCompactObjectHeaders`
default `false` on 25 ✓, and `false` on 26 per `jdk-26-ga globals.hpp`.

**JDK 26 rows, against `jdk-26-ga` source.** `ZGenerational` absent from both
`special_jvm_flags` and `gc_globals.hpp` ✓ (and the skill hedges this exactly as §F.1
demands). `LockingMode { 24, 26, 27 }` ✓. `UseCompressedClassPointers { 25, 27, undefined }` —
the skill's "26→27" note is right ✓. The seven-flag deprecation block `{ 26, 27, 28 }` ✓,
verbatim. The obsoletion set counts to exactly 18 ✓. `MaxRAM` default 0 and marked
"(Deprecated)" — the 128 GB cap is gone ✓. `InitialRAMPercentage 0.0` ✓.
`UseGCOverheadLimit falseInDebug` (⇒ `true` in product) ✓.

**JEP 523.** Fetched from openjdk.org: Closed/Delivered, Release **27**, "the JVM will always
select G1, regardless of the number of processors and the available physical memory", and the
1792 MB figure is stated there. The skill's "scheduled, not observed" framing is correct.

**Every `jfr view` name the skill emits.** Generated a `default`-settings recording on 25 and
ran all seventeen: `gc-pauses`, `safepoints`, `gc-cpu-time`, `hot-methods`,
`heap-configuration`, `gc-configuration`, `allocation-by-site`, `blocked-by-system-gc`,
`container-configuration`, `container-cpu-throttling`, `native-memory-committed`,
`native-memory-reserved`, `memory-leaks-by-site`, `longest-class-loading`,
`compiler-statistics`, `contention-by-site`, `cpu-time-hot-methods`. All resolve. Column claims
spot-checked: `heap-configuration` really reports `If Compressed Oops Are Used` and
`Compressed Oops Mode`; `gc-pauses` really reports the min/median/avg percentile set;
`blocked-by-system-gc` really returns the **caller's stack trace**, which is what makes the
skill's "no stack trace, no `DisableExplicitGC` recommendation" rule enforceable.

**No number without a method.** I hunted specifically for the three the brief flagged. The
skill quotes **none** of them as fact: `TieredStopAtLevel=1` — "Magnitude: unpublished … Do not
quote a percentage"; `AlwaysPreTouch` — "Magnitude: unpublished … Do not quote a number";
JEP 519/534 — quoted with the mandated caveat verbatim. The two numbers it does carry (NMT
5–10%, JEP 450's 5% design bound) each travel with their provenance and their gap. §F items 5,
6, 7 and 9 are each carried into the skill as an explicit "unverified" marker. The brief's
UNRESOLVED section is respected in full — I found nothing the skill states as settled that the
brief could not verify.

**Causality.** GC pause vs GC cost are separated everywhere they appear (`gc-pauses` _and_
`gc-cpu-time`, with "changing thread counts with only one of the two is trading pause time
against CPU while measuring one side"). Safepoint duration vs time-to-safepoint vs collector
pause is separated correctly, including the "both small → not the JVM's pause machinery" exit.
Allocation rate vs live set is separated by the right discriminator (post-full-GC occupancy vs
rising peak). RSS vs heap is separated, with the untracked glibc residual named. I found no
diagnosis that would misattribute one to another beyond m6.

**Evidence-and-confidence shape.** Conforms. Exactly one worked example, not a template per
finding type. The block carries Evidence / Observation / Inference / Hypothesis /
Recommendation / Confidence, plus a separate `Reason:` and the confirm/kill pair — an
extension, not a deviation. `Reason` is required, LOW is required where the artefact is static
("Emit LOW when the evidence is static … A review that reports HIGH on every finding is not
calibrated"), and the example itself emits LOW. The standard's "state what the tool cannot
show" is honoured for `ExecutionSample` (native/JNI blind spot, silent failure, thread
subsetting), NMT (reserved vs committed; cannot be enabled at runtime), heap dumps ("shows what
is in the heap, not whether it is growing"), and the command line vs `VM.flags`.

**House standard and manifest.** Body 166 lines (limit 500). No persona opener. Nothing in the
body that is only conditionally relevant — the four references are each routed by an explicit
condition tied to a numbered step. Rules are checkable (each names an observable: a release
number, a command, a confidence label). `schemaVersion: 1`; `name` matches directory and
frontmatter; `version` strict semver; `license: Apache-2.0`; `files:` lists `SKILL.md`,
`skill.yaml`, `references/`, all present. `agent-skills validate` → "6 files, ✓ Valid — no
issues found". Description 1014 bytes ≤ 1024 and byte-identical across both files. Routing is
bidirectional: `java-performance/SKILL.md` line 44 routes "A flag set, GC log or JFR handed
over to audit" here, and every neighbour named in the description exists on disk.

---

## Range validated, and what I could not verify

**Executed against:** Temurin 25.0.3+9 LTS, Windows x64, 24 logical CPUs.
**Source-verified at tag:** `jdk-25-ga` and `jdk-26-ga` (`arguments.cpp`, `gc_globals.hpp`,
`os.cpp`, `zArguments.cpp`), fetched during validation.
**Accepted from the brief without independent re-check:** all `jdk-21-ga`, `jdk-11+28`,
`jdk-14+36`, `jdk-15+36`, `jdk-16+36`, `jdk-17+35`, `jdk-18+37`, `jdk-20+36` citations.

Not verified:

1. **All JDK 21 behaviour.** No JDK 21 available. Every JDK 21 column in the matrix rests on
   the brief's source reading. In particular `-XX:+ZGenerational` "product, default false" on
   21 and `-Xdebug` "accepted silently" on 21 are untested.
2. **All JDK 26 behaviour.** Source-only. The skill's own hedge on `ZGenerational` ("confirm on
   your build with `java -XX:+ZGenerational -version`") is the right handling and I did not
   improve on it.
3. **Anything Linux-only.** `UseContainerSupport`, cgroup v1/v2 file reads, the hierarchy-walk
   warning, actual CFS throttling, `-Xlog:os+container=trace`, `System.native_heap_info`, the
   NUMA self-disable paths, and B1's formula _in situ_. B1 was found by reading the cited source
   against the skill's transcription, not by running a constrained cgroup. A Linux container
   run would strengthen the container chapter considerably and I recommend one before release.
4. **`jdk.ContainerCPUThrottling` on JDK 21.** The skill already marks this unverified
   (§F.7); I could not close it either.
5. **`jfr view` availability on JDK 21.** The "present in 25 but not 21" list is taken from the
   brief's `view.ini` diff.
6. **Oracle's 5–10% NMT figure.** Unfalsifiable as published; the skill's handling (quote with
   the gap named) is the correct response and needs no verification.

---

# Iteration 2

Re-validated on the same rig: Temurin 25.0.3+9 LTS, Windows x64, 24 CPUs.

## (a) Fix verification — all four correct and complete

**B1 — closed.** `container-arithmetic.md:25-29` now initialises `limit_count = host_cpus`.
No-quota case yields `host_cpus`; formula matches `CgroupUtil::processor_count` and the prose.

**M1 — closed, and the coordinator's correction is right.** Reproduced: at `-Xmx40g`,
`-Xlog:gc+heap+coops=debug` emits **0** lines; at `-Xmx8g` it emits 1. The tag-set is silent in
exactly the state the skill wants to detect, so my proposed `=debug` fix was wrong.
`-Xlog:gc+init` reports both at info — `Compressed Oops: Disabled` / `Enabled (Zero based)`.
All three occurrences now use it.

**M2 — closed.** No `aot` claim remains. `flag-cost-and-defaults.md:56` now warns off
`gc+heap+coops` explicitly.

**Scope — closed.** `-Xlog construction (unified-logging)` present. Description 990 chars /
992 bytes, byte-identical across both files. `agent-skills validate` → no issues.

**Sweep for the same class of error** (command silent at its stated level). Every other
executable command in the package emits what the skill says it does:
`-Xlog:gc,safepoint` prints both discriminators on a real workload — `Reaching safepoint:
7000 ns` vs `At safepoint: 1824700 ns`, exactly the time-to-safepoint / duration split
`missing-measurements.md` D.1 relies on (my first probe returned 0 only because the test
program allocated nothing); `-Xlog:startuptime` 18 lines; `-Xlog:class+load:file=` 2530 lines;
`-Xlog:gc:file=<f>:time,uptime,level,tags` writes correctly — an earlier failure was MSYS
mangling `/tmp/...` into `C:/...`, whose colon breaks `-Xlog`'s own delimiter, a Windows shell
artifact and not a defect. `-Xlog:os=info` NUMA lines remain unverifiable off Linux (m1).
**No further instance of the M1 class found.**

## (b) M3 arbitration — I reproduce it; we tested different code paths

The mechanism is real, but only on the **ergonomic** sizing path. The capping branch lives
inside `set_heap_size`'s `if (FLAG_IS_DEFAULT(MaxHeapSize))` block, so an explicit `-Xmx`
skips it entirely — which is what the coordinator tested. Exact command lines:

```
$ java -XX:MaxRAM=128g -XX:MaxRAMPercentage=85 -XX:+UseCompressedOops -XX:+PrintFlagsFinal -version
   size_t MaxHeapSize      = 32178700288    {ergonomic}     # ~30 GiB
     bool UseCompressedOops = true          {command line}

$ java -XX:MaxRAM=128g -XX:MaxRAMPercentage=85 -XX:+PrintFlagsFinal -version
   size_t MaxHeapSize      = 116836532224   {ergonomic}     # 108.8 GiB
     bool UseCompressedOops = false         {ergonomic}
```

Same artefact as the worked example, one flag apart, and the heap differs by 78 GB.
With `-Xmx134g -XX:+UseCompressedOops` I get the coordinator's result — heap honoured,
`UseCompressedOops=false`, flag ignored. Both observations are correct.

The rewritten `Kills it:` is a genuine improvement and I withdraw my mechanism as _the_
falsifier. **One residual MINOR:** its alternatives list — cgroup limit, a later `-Xmx`, the
JVM seeing less memory than the node advertises — omits the case above, which is the only one
that silently truncates a 108 GB heap to 30 GB while leaving the artefact looking correct.
Fix: add "an explicit `-XX:+UseCompressedOops`, which caps the ergonomic heap at the
threshold instead of disabling coops — a P2 finding of its own".

## (c) Counts and verdict

**0 BLOCKER, 0 MAJOR, 6 MINOR, 5 NIT.**

BLOCKER and both surviving MAJORs are closed; M3 is withdrawn as written and reopened as a
MINOR. Iteration 1's other MINOR/NIT items (m1, m2, m3, m4, m6, m7, n1–n5) were not in scope
for this pass and I did not re-check them.

**Gate verdict: PASS** — zero BLOCKER, zero MAJOR.
