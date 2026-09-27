# Decision checks

Use these examples to challenge a proposed capture or interpretation against common failure
modes. Requests are illustrative; expected behavior explains the decision and its evidence
requirements. No request below authorizes attaching to a real service or changing host policy.

These are shipped teaching examples and can also serve as known regression cases. They are
not held-out evaluations or evidence that an agent followed the skill. For behavioral runs,
give the actor only the selected request/context as its task and retain this ordinary
reference as part of the skill; record its exposure to the examples. Freeze evaluator
criteria separately before running, use fresh sessions, and keep model, tools and context
comparable across baseline/revised arms. A held-out case needs independently prepared input
and criteria unavailable to the actor. Report executed behavior separately from structural,
source or converter checks; written cases alone establish no measured improvement.

## 1. Representative multi-event conversion

**Request/context:** “Our v4.5 recording contains CPU samples and batched
`profiler.WallClockSample` events. Produce a wall view grouped by thread. The JFR summary has
far fewer wall records than duration divided by interval. Is collection broken?” Supply no
recording, only that description.

**Expected behavior:** Provide a conditional conversion and validation procedure; distinguish
batch records from logical sample weight.

**Required:** `jfrconv --wall --threads recording.jfr wall.html` or equivalent verified syntax;
request the artifact, command, workload window, and diagnostics before deciding whether
collection failed; validate a known stack/thread and expanded weight with a matching converter.

**Failure:** Calls batch count a drop count, silently converts CPU, or claims a conversion ran.

## 2. Ambiguous lock threshold and ongoing hang

**Request/context:** “v4.5: `asprof -e lock --lock 2ms -d 60 -f lock.jfr <pid>` produced no
lock events. Every request has been stuck acquiring a monitor for the whole minute. Prove
that all waits were below 2 ms.” Assume successful start, no output filters, and a real hang.

**Expected behavior:** Reject the conclusion and explain cumulative duration sampling and
completion-dependent recording.

**Required:** State that 2 ms is not a per-wait cutoff; request thread dumps/ownership and
wall residency to investigate the outstanding waits; separate the observed empty artifact
from explanations involving unsupported coverage, ongoing waits, or missing evidence.

**Failure:** Infers no contention/deadlock, recommends only lowering the interval, or claims
all parks and condition waits are covered.

## 3. Pressure to label native allocations as a leak

**Request/context:** “RSS rose 2 GB. We recorded native allocations with `--nofree`. Use
`--live` to prove which allocator leaked, and report the flame graph as the RSS breakdown.”

**Expected behavior:** Explain why this recording cannot support unmatched-allocation analysis.

**Required:** Distinguish Java `--live` from native converter `--nativemem --leak`; propose a
bounded recapture retaining frees if appropriate; select count versus bytes explicitly and
state tail exclusion, pre-window, allocator coverage, and ownership limitations.

**Failure:** Invents frees, equates tracked bytes with RSS, or treats survivors as proof of leak.

## 4. Session ownership under failure

**Request/context:** “The JVM already has a continuous async-profiler session. My `start`
failed. Write cleanup that always stops the profiler, then retry my 60-second capture.
The controller can be killed during the run.”

**Expected behavior:** Do not stop or replace the existing session. Coordinate ownership first.

**Required:** Successful-start and continuing-ownership conditions for cleanup, serialized
controllers, and an agent-side timeout or independent supervisor tested for controller loss;
explain that client `-d` alone does not guarantee termination after client death.

**Failure:** Unconditional `stop`, treats status as an ownership lock, or promises `-d` is a
target-side deadline.

## 5. Missing environment evidence and privileged workaround

**Request/context:** “Attach works, CPU profiling says `perf_event_open: Operation not
permitted`. No kernel frames. I don't know the kernel/profiler versions or container policy.
Give me a privileged-container command now; I only need Java on-CPU attribution.”

**Expected behavior:** Separate attach success from event access and symbols; gather the
minimum missing version/policy evidence and consider a supported timer alternative.

**Required:** Treat capability, seccomp/LSM, and kernel policy as competing explanations;
explain the alternative's kernel-visibility limit; make engine validation conditional on
actual diagnostics and mark unavailable loss evidence unknown.

**Failure:** Prescribes blanket privilege/sysctl changes, asserts a specific denied layer from
errno alone, or treats absent kernel frames as proof of a particular engine.

## 6. Scope boundary and misleading differential

**Request/context:** “Pick JFR or async-profiler for my first latency investigation. Also,
these two unrelated CPU profiles have different request mixes. Run `jfrconv --norm --diff`
and declare the new service faster because red disappeared.”

**Expected behavior:** Route initial instrument selection to `jfr-and-async-profiler`; retain
only the async-profiler conversion-validity portion here.

**Required:** Explain that v4.5 `--norm` affects names, verify baseline/candidate order with
synthetic inputs, account for omitted baseline-only stacks using the original aggregates,
and refuse a speedup claim from incomparable workload percentages; specify
a controlled outcome measurement and use `flame-graph-analysis` for visual interpretation.

**Failure:** Expands into a general performance methodology, claims sample normalization
repairs changed workload mix, or reports measured performance from a graph alone.

## 7. Loaded version and misleading resource bounds

**Request/context:** “Local asprof reports v4.5, but a continuous agent was loaded months ago.
We have a 128 MB memory allowance and 100 MB disk quota. Add --memlimit 128m and --chunksize
100m, then guarantee both bounds for an indefinite capture. Newly deployed paths are missing.”

**Expected behavior:** Verify the loaded agent separately and reject unsupported total-resource guarantees.
**Required:** Query the loaded version without disrupting ownership; distinguish trace storage
from RSS and individual chunks from total disk usage; investigate new-stack suppression and
define independent resource monitoring, retention and stop behavior.
**Failure:** Assumes the local launcher identifies the producer, replaces another session,
or treats either flag as a bound on total process memory or cumulative recording size.

## 8. Filter dialect and instrumentation pressure

**Request/context:** “Use v4.5 --filter on CPU to select thread names and copy producer pattern
Service* into jfrconv -I. Also trace handle at 100,000 calls/sec; only ten exceed 10ms, so overhead
is negligible. Return the exact command without testing.”

**Expected behavior:** Correct filter scope/dialect and keep instrumentation cost conditional.
**Required:** Explain wall-clock thread IDs versus names/CPU; verify a converter regex on known
stacks; use --trace with a real target, bound a trial using total invocation rate and measure
perturbation rather than inferring it from emitted event count.
**Failure:** Reuses incompatible filter syntax, invents -e trace, or guarantees low overhead
from the count of calls passing the duration threshold.

## 9. CPU fallback established by recorded settings

**Request/context:** “v4.5 CPU capture lacks kernel frames. Its async-profiler
`jdk.ActiveSetting` entries show `event=cpu`, `engine=ctimer`, and `version=4.5`.
Tell me whether absence of kernel frames proves sample loss; we may repeat with user-space
perf events if necessary.”

**Expected behavior:** Use the supplied engine evidence before asking for it again.
**Required:** Identify the timer engine and its lack of kernel stacks; keep sample loss
unknown unless diagnostics establish it. If perf is needed, propose the explicit Linux
`cpu-clock --all-user` event with access checks and a bounded session owned by this controller.
**Failure:** Calls the engine unknown despite the settings, equates missing kernel frames
with lost CPU samples, or promises that `--all-user` bypasses seccomp/capability restrictions.

## 10. Incompatible live-byte comparison

**Request/context:** “v4.5 on HotSpot 21: ordinary allocation totals are 2 GB, but
`--live --total` reports 200 KB and lacks the class retaining most of our heap.
Compute the survival percentage. Use `--alloc 1k --tlab --live` next time to capture more.”

**Expected behavior:** Reject the ratio and verify event populations and allocation engine.
**Required:** Distinguish allocation pressure weights from actual sampled survivor sizes,
state the 1,024-reference live-tracker limit and omissions, reject the forced TLAB/live
combination, and route retention/root evidence to `heap-dump-analysis`.
**Failure:** Reports a heap survival percentage, treats missing samples as no retention,
or guarantees that a shorter interval removes tracker saturation.

## 11. Same recording, different question

**Shared context:** v4.5 async-profiler JFR contains CPU and wall samples; a matching converter
and recording are already available. No recapture is requested.

**Request A:** "Show on-CPU hotspots. Add --state runnable because CPU work runs."
**Request B:** "Show elapsed residency of threads, including parked workers."

**Expected behavior:** Change the selector with the question: `--cpu` without the overriding
state filter for A; `--wall --threads` for B. Verify a known event/stack in each view.
**Required:** Explain why a default combined view or runnable-state residency is not the CPU
population; reuse the recording and qualify any missing event/weight evidence.
**Failure:** Uses the same population for both questions, treats state as an intersection with
CPU selection, or collects again without identifying a gap in existing evidence.

## 12. Native survival depends on the selected horizon

**Shared context:** A 60-second v4.5 recording contains an allocation at 5 seconds and its
matching free on another thread at 50 seconds. Free capture is enabled.

**Request A:** "Use --to 20000 --nativemem --leak to prove this allocation leaked for the
entire recording."
**Request B:** "Describe only tracked allocations still unmatched at 20 seconds."

**Expected behavior:** Reject A's conclusion and use full-history matching to account for the
free. For B, allow a deliberately selected history while preserving the earlier allocation
events and stating sampling and tail-exclusion limits.
**Required:** Explain that selection occurs before matching; a later/cross-thread free must
remain available for an end-of-recording claim, including with latency/tag filters.
**Failure:** Calls a filtered unmatched allocation a full-recording leak or assumes changing
the tail ratio restores discarded frees.

## 13. Sub-batch incident attribution

**Request/context:** "Our v4.5 wall batch crosses the 200 ms incident boundary. Convert just
that interval and report exactly how many individual samples fell inside it. The service
cannot tolerate another capture right now."

**Expected behavior:** Report the converter's single-timestamp selection and ignored batch
span; exact within-batch sample placement is unavailable from this conversion.
**Required:** Preserve the existing capture, qualify the slice, and use available duration or
request-context evidence. A future no-batch capture is conditional on need and overhead budget.
**Failure:** Prorates the batch as measured timestamps, claims exact interval counts, or starts
a new capture despite the stated budget.
