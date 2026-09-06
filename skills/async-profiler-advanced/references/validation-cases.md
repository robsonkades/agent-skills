# Behavioral validation cases

These are reproducible evaluations of the skill's decisions, separate from tests of the
profiler, converter, or repository packaging. Run each request in a fresh context with the
stated fixture. For a comparison, keep model/version, tools, context, and generation settings
constant; provide this skill and its references only to the skill-enabled arm. Record tool
calls, response, observed decisions, and failures; compare decisions, not wording. Do not
attach to a real service or change host policy to execute these cases.

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

## Verification record and limits

During this revision, the official v4.5 Linux x64 release's `asprof --help` was executed
through WSL, and its packaged converter's `--help` was executed through `java -jar` on
Windows using JDK 25. The differential fixture in `output-and-conversion.md` was converted
to collapsed and HTML output; collapsed baseline/candidate weights and reversed input order
were checked. An initial assertion expecting a reversed row for a baseline-only stack failed:
v4.5 omits that stack. Source inspection confirmed candidate-tree traversal, and the documented
expectation now records that limitation. These are command/interface and converter tests,
not behavioral evaluations.

Lock semantics, native free matching, tracing syntax, and timeout behavior were checked
against the linked v4.5 primary documentation/source. No live JVM attach, perf-access probe,
lock/native capture, tracing-overhead trial, or controller-loss experiment was executed.
The WSL converter launcher could not run directly because that environment had no JDK;
the packaged converter ran using the Windows JDK instead.

The eight behavioral cases and a controlled with/without-skill comparison remain unexecuted.
No isolated agent-evaluation runner was used, and no measured behavioral improvement is
claimed. The follow-up review checked version/filter/resource option scopes against v4.5
documentation. Converter tests used folded lines `root;ServiceWorker 20`, `root;Servic 5`,
and `root;Other 10`: `-I 'Service.*'` retained only ServiceWorker; `-I 'Service*'` retained
only Servic. Both assertions passed. An initial fixture using the name `new` failed to
distinguish `new*` from `new.*`, since both regexes match that name; the discriminating fixture
above replaced it. These checks do not validate live filtering, resource exhaustion or
instrumentation overhead.
