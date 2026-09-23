# Behavioral validation cases

Use these as teaching exercises or known-case regression checks. They test diagnostic
decisions, not Java runtime correctness or repository packaging. All numbers below are
synthetic inputs. The expected answers ship with the skill, so these are not unseen tests.

## Reproducible procedure

For each case, give a fresh agent the request and context verbatim. Keep model/version,
reasoning settings, tools, repository context and tool permissions identical across runs.
For a paired comparison, the baseline receives no allocation-profiling content; the treatment
receives its description, SKILL.md and access to its routed references. Prevent automatic
discovery of the skill in the baseline. This reference is ordinarily accessible to the
treatment: record that exposure and describe these results as known-case checks. For an
unseen test, define separate inputs and grading criteria outside actor access before the run;
do not claim these shipped answers were hidden. If the harness excludes this reference,
report that restriction because it changes the treatment being evaluated.
Record prompts, loaded resources, tool calls, outputs and pass/fail reasons against each
criterion. For selection cases, expose the description among the same neighboring descriptions
and record selection before supplying any body. If a valid isolation cannot be arranged,
report the comparison as pending rather than substitute self-assessment.

## 1. Representative allocation regression

**Request/context:** “Find a change to test. JDK 25/G1, fixed heap, warmed workload and payload
mix. Before and after the deploy: 1,000 completed requests/s; aggregate allocation rose from
20 to 60 MB/s (decimal units). Weighted stacks repeatedly attribute about 40 MB/s to a new
debug payload serialization call. Debug output is disabled. p99 rose from 30 to 45 ms; young
GCs became more frequent. No candidate fix has been run.”

**Expected behavior:** Identify eager serialization as a testable explanation; inspect the
logging API and evaluation of arguments before proposing a matching debug guard/lazy API.

**Required output:** 20,000 versus 60,000 B/request with aggregate/background caveat; measured
observations separated from the hypothesis; semantic check and matched before/after total
bytes/op, site contribution and p99/GC validation.

**Failure:** Claiming p99 is proven to be caused by this site, promising proportional GC savings,
claiming a fix was validated, or prescribing heap flags before testing the measured extra work.

## 2. Missing evidence and incompatible commands

**Request/context:** “JDK 21 service. An attached JFR summary contains zero InNewTLAB and
OutsideTLAB events. No recording settings, sample counts, stacks or workload window were
provided. Approve removing our profiler because this proves zero allocation. Also provide a
combined async-profiler 4.1 CPU/allocation HTML command. Our deployment must remain on
JDK 21.”

**Expected behavior:** Reject the zero-allocation inference, request/inspect settings and
ObjectAllocationSample evidence, and establish whether the workload ran. Correct the requested
combined format to JFR and check deployment support/access.

**Required output:** A bounded next measurement; distinguish offline JDK 21 jfr view from
target-dependent live JFR.view; preserve the target JDK and use compatible offline tooling;
explain that zero legacy events may reflect disabled settings.

**Failure:** Approving removal, assuming the legacy events were enabled, using combined HTML,
claiming JDK 21 necessarily provides live JFR.view, or upgrading the runtime to obtain it.

## 3. Virtual-thread accounting trap

**Request/context:** “JDK 25. Requests run in virtual threads and delegate work. The submitting
platform thread's allocation delta is 128 B. getThreadAllocatedBytes(virtualThreadId) is -1.
JFR ThreadAllocationStatistics names carrier threads. Can we report 128 B/request, or sum
the carrier counters for each task?”

**Expected behavior:** Decline both task-total claims; explain delegation and mixed carrier
work. Check support/enabled state and lifecycle before interpreting -1.

**Required output:** A controlled isolated-workload process-total delta per completed request,
with background-work limits, plus sampled producing stacks. Distinguish eventThread identity
from weight/accounting population.

**Failure:** Measuring worker allocation on the submitter, treating periodic statistics as
exact per-virtual-thread bytes, treating -1 as zero, or summing cumulative snapshots.

## 4. Boundary size and premature retention conclusion

**Request/context:** “OpenJDK 25 GA/G1, 4 MiB regions. One object's aligned total size is
exactly 2 MiB; another byte array has a 2 MiB payload plus its header. Humongous regions
remain 56->56 at one young pause. Confirm both are humongous and the unchanged count proves
a leaking cache; then pool them.”

**Expected behavior:** Apply the implementation's strict greater-than comparison to total
aligned size; distinguish payload from object size. Explain the guide/source discrepancy
and reject the leak inference from one pause.

**Required output:** First object is not humongous under the stated build; second crosses
the threshold. Request allocation stacks, reclamation-cycle and ownership evidence; compare
streaming/bounded reuse only after establishing lifetime and benefit.

**Failure:** Classifying both identically, using payload alone, declaring a cache/leak proven,
or automatically introducing an unbounded pool.

## 5. Pressure to accept a misleading improvement

**Request/context:** “Approve our shared pool of 128-byte DTOs. Site A fell from 40% to 10%
of sampled bytes. Total allocation is still 50,000 B/request at the same load; retained heap
doubled and p99 worsened. Hit rate is 95%. We have no reset, exception-return or capacity tests.”

**Expected behavior:** Reject the approval claim; investigate moved allocation and the
retention/latency regression. Do not apply an arbitrary object-size or hit-rate cutoff.

**Required output:** Hold/revert the candidate pending a demonstrated benefit; specify bounded
ownership/reset/return behavior and meaningful tests if reuse is pursued. Treat a smaller
profile percentage as insufficient evidence of fewer total bytes.

**Failure:** Approving from site percentage or hit rate, ignoring worsened outcome, asserting
all pools require atomics, or replacing missing lifecycle checks with only a throughput test.

## 6. Scope boundary

**Request/context:** “Allocation rate and request mix are stable. A heap dump shows growing
retained session objects rooted in a static map. Find which reference keeps sessions alive
and design expiry. No allocation-rate or sampling question is open.”

**Expected behavior:** Select/defer to heap-dump-analysis and retention/ownership work; avoid
making allocation profiling the primary workflow.

**Required output:** Reference/root and lifecycle investigation, with no needless allocation
capture or collector/TLAB change.

**Failure:** Insisting on an allocation flame graph before using the supplied retention
evidence, or equating the allocation site with the retaining owner.

## 7. Cold lifecycle versus a warmed result

**Request/context:** “Our Java 25 batch JVM runs once and exits. The explicit goal is lower
total allocation from launch through job completion, although the current latency SLO passes.
A candidate drops warmed JMH bytes/op by 30%, but adds a startup precomputed table. Existing
whole-job recordings and job counts are available. Approve the improvement.”

**Expected behavior:** Inspect the existing whole-job evidence and preserve startup work in
the comparison. Treat the warmed result as evidence about its isolated operation, not the
requested lifecycle. The passing latency SLO does not invalidate the separate allocation goal.

**Required output:** A matched launch-to-completion byte and outcome comparison including
the table and job definition; distinguish a candidate from a verified improvement. If the
candidate has no demonstrated payoff, retaining the implementation is a valid decision.

**Failure:** Discarding startup as warm-up, approving from JMH alone, forcing a new production
capture despite sufficient retained evidence, or refusing the goal merely because an SLO passes.

## Evaluation status and source limitations

These cases have not been executed as paired agent runs. Repository verification and any
local JDK smoke checks are technical checks, not measured behavioral improvement.

Version-sensitive guidance cites OpenJDK 25 GA sources, Oracle API/command documentation and
async-profiler 4.1 sources. Source review does not demonstrate command compatibility or a
performance benefit on a particular service; validate the deployed OS/JDK/profiler combination.
