# Selection test prompts — `jvm-performance-review`

Eight prompts. Five must select this skill; three near-misses must select a named
neighbour. Two of the positives are adversarial — the correct output there refuses the
premise rather than answering the question as asked.

---

## POSITIVE — must select `jvm-performance-review`

### P1 — the inherited flag blob (the core case)

> We inherited this service from a team that left. Its `JAVA_TOOL_OPTIONS` is:
> `-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:+UseBiasedLocking
-XX:BiasedLockingStartupDelay=0 -XX:+PrintGCDetails -Xloggc:/var/log/gc.log
-XX:+UseGCLogFileRotation -XX:NumberOfGCLogFiles=5 -XX:MaxRAMPercentage=85
-XX:+AlwaysPreTouch -Xms512m -Xmx6g`. We're on `eclipse-temurin:25-jre`. Is any of
> this doing anything?

**Correct behaviour.** Audits, does not tune. Pins the release (JDK 25) first. Reports as
P1 that `UseBiasedLocking`, `BiasedLockingStartupDelay` and `UseGCLogFileRotation` /
`NumberOfGCLogFiles` make the JVM refuse to start — so this line as written has never run on
25 and something else is in effect. `ParallelRefProcEnabled` is P4: already the ergonomic
default when `ParallelGCThreads > 1`, and a deprecation warning from 26.
`AlwaysPreTouch` with `-Xms512m -Xmx6g` is the useless form — pretouch happens incrementally
during traffic, not at startup. `MaxRAMPercentage=85` triggers the compressed-oops check.
Asks for `jcmd VM.flags`. Emits LOW throughout with the reason "static artefact, no running
JVM". Does **not** quote a throughput number for `AlwaysPreTouch`.

### P2 — the JDK upgrade gate

> We're moving from JDK 21 to JDK 25, and then to 26 next quarter. Our ZGC services carry
> `-XX:+UseZGC -XX:+ZGenerational -XX:+UseNUMA -XX:LockingMode=1
-XX:-UseCompressedClassPointers`. What breaks?

**Correct behaviour.** Answers per release, because the answer differs on each.
`ZGenerational`: fine on 21, warns and is ignored on 25, and is expected to refuse to start on
26 — stated with the hedge the source-only evidence requires, plus
`java -XX:+ZGenerational -version` to confirm on their build. `LockingMode=1`: warns and is
still effective on 25, ignored on 26, fatal on 27. `UseCompressedClassPointers`: deprecated in
25, obsolete in 27. `UseNUMA` next to ZGC is noise, not a hazard. Separates "works today" from
"survives the upgrade" as two findings.

### P3 — the Kubernetes manifest

> Our pods have `resources: {requests: {cpu: 500m, memory: 2Gi}}` and no limits, running on
> 64-core nodes with 256 Gi. Java 25, no JVM flags at all. p99 is terrible and the pods
> restart sometimes. What is the JVM actually doing in there?

**Correct behaviour.** Reaches `references/container-arithmetic.md`. With no `limits.cpu` the
JVM sees the whole host's 64 CPUs, sizing GC threads, JIT compiler threads,
`ForkJoinPool.commonPool` and the virtual-thread scheduler for hardware the pod will never get,
while CFS-throttling against a 500m request — P2. With no `limits.memory` the heap base is the
node's 256 Gi, so the default 25% lands near 32 GB in a pod with a 2 Gi request. Names
`-Xlog:os+container=trace` / `java -XshowSettings:system` /
`jfr view container-configuration` as the settling evidence, and
`jfr view container-cpu-throttling` for the throttling half. Does **not** propose a heap number
without an NMT or JFR committed-memory reading first.

### P4 — the post-mortem artefact

> Post-mortem attached. `jcmd VM.flags` from the surviving pod, plus the GC log for the ten
> minutes before the kill. The theory in the incident channel is that `-Xmx` was too big.
> Sanity-check the config before we sign this off.

**Correct behaviour.** Treats the supplied `VM.flags` as outranking anything from the
deployment YAML, and says so. Checks the collector actually in use (Serial by ergonomics is a
live possibility on a small pod) and `usesCompressedOops` before entertaining the `-Xmx`
theory. Points out that an OOMKill with no NMT summary is un-attributable, and that lowering
`-Xmx` is a coin flip — if the growth is in metaspace or native, a smaller heap makes the crash
arrive sooner while masking the leak. Flags that NMT cannot be turned on retroactively, so the
fix for attributing this one is a restart flag for the next one.

### P5 — ADVERSARIAL: flags demanded, nothing measured

> Don't give me a lecture. Our p99 is 800 ms and the SLO is 200 ms. I need a list of JVM
> flags to put in the deployment by end of day. Just the flags.

**Correct behaviour — the output refuses the premise.** This is the case the skill's gate names
verbatim. There is no flag list, and no flag list after the refusal either. The output is: the
single cheapest discriminating measurement, as an exact command —
`-XX:StartFlightRecording=settings=default,maxsize=256m,filename=/tmp/app.jfr,dumponexit=true`,
then `jfr view gc-pauses app.jfr` and `jfr view safepoints app.jfr` (or `-Xlog:gc,safepoint`
without JFR) — plus what each result would mean: pause p99 comparable to the regression → GC;
short pauses with long time-to-safepoint → a thread that will not reach a safepoint, not GC;
both small → the latency is not in the JVM's pause machinery at all and **no flag addresses
it**. It must also state the four things missing before any flag can be justified:
`jcmd <pid> VM.flags`, `jcmd <pid> VM.command_line`, `java -version`, and the SLO with its
load. Pressure ("just the flags", "by end of day") must not convert this into a hedged flag
list — a refusal followed by "but if you must, try `-XX:MaxGCPauseMillis=100`" is a failure of
this test.

### P6 — ADVERSARIAL: GC blamed, the evidence points elsewhere

> Latency spiked to 2 s at 14:05. It's definitely GC. Here's the JFR:
> `gc-pauses` shows P99 4.1 ms over 900 pauses, `gc-cpu-time` shows 11 s of user time across
> the hour, and `container-cpu-throttling` shows `cpuThrottledTime` climbing steeply from
> 14:03. Which GC flags fix this?

**Correct behaviour — the output refuses the premise, and says why the stated cause is
excluded.** A 4.1 ms pause P99 cannot produce a 2 s spike; GC CPU is a rounding error against
an hour of wall clock. The supplied evidence already points at CFS throttling, which is a CPU
limit problem fixed by the limit or `-XX:ActiveProcessorCount`, **not** by any GC flag — and
notably not by `TieredStopAtLevel=1`, which is the reflex answer here and the wrong one. The
correct output names what to measure next to close it (throttled slices over elapsed slices at
peak, timestamp-correlated with the 14:05 window; and `jcmd VM.flags` to confirm which
collector is even running before anyone proposes changing it), and states plainly that no GC
flag is warranted on this evidence. Agreeing that it is GC, or offering
`-XX:MaxGCPauseMillis` / `-XX:ParallelGCThreads` "since you're already looking at GC", is a
failure of this test.

---

## NEGATIVE — must select a named neighbour, not this skill

### N1 — symptom, no artefact → `java-performance`

> The checkout service got slow after last Thursday's deploy. Nobody knows why. Where do I
> even start?

**Correct behaviour.** Routes to `java-performance`, the symptom router. There is no artefact
to audit and no flags in the request; `java-performance` classifies the symptom and hands off,
and its own routing table sends "a flag set, GC log or JFR handed over to audit" back here if
one later appears. Selecting `jvm-performance-review` first would apply an artefact workflow to
a request with no artefact.

### N2 — a GC log to interpret → `gc-log-analysis`

> Here are 40 MB of `-Xlog:gc*` output. I need to understand the `Pause Full (G1 Compaction
Pause)` entries — what the before→after→capacity triple is telling me, whether the heap
> floor is rising after each full collection, and why `gc+age` shows what it does.

**Correct behaviour.** Routes to `gc-log-analysis`, which owns reading unified GC logs: the
cause field, the occupancy triple, headroom, premature promotion via `gc+age`, and correlating
with `-Xlog:safepoint`. `jvm-performance-review` treats a GC log as an artefact _offered as
evidence for a configuration claim_; it does not do log-reading depth.

### N3 — collector choice and heap sizing → `jvm-gc-tuning`

> GC is confirmed as our bottleneck — 30% of wall clock is in pauses, measured. We're on G1
> with a 24 GB heap and a 40 ms p99 pause target. Should we move to ZGC, and how big should
> the heap be?

**Correct behaviour.** Routes to `jvm-gc-tuning`, which owns "is GC the bottleneck, and if so
which collector and what heap size". GC is already confirmed by measurement, there is a stated
SLO, and no artefact is being audited — this is a tuning decision, which
`jvm-performance-review` explicitly excludes in its description. Selecting this skill would
produce a configuration review of a question that is not about the configuration.
