# Behavioral validation cases

These are synthetic requests for evaluating the skill, not measured improvements or tests
of a generated application. No paired agent runs have been executed for this revision.

## Reproducible comparison

Use fresh baseline and treatment sessions with the same model/version, reasoning settings,
tools, permissions and supplied context. The treatment receives this skill's description,
body and access to routed references; the baseline must not discover them automatically.
Keep expected behavior and failure criteria out of both prompts. For activation tests,
present only the description among the same neighboring descriptions before loading bodies.

Save input, loaded resources, tool calls, output and pass/fail reasons. Judge observable
decisions, not exact phrasing or a numerical quality score. If comparable isolation is
unavailable, report the runs as pending; do not substitute mental simulation. Arithmetic or
link checks on these fixtures validate the fixtures only.

## 1. Comparable alternatives and sunk cost

**Request/context:** “Choose Kafka or our integration platform for moving inventory updates.
The platform already contains a Kafka connector and also handles transformations and
destination delivery. Kafka alone would need those capabilities added. The old platform
purchase is nonrefundable; cancelling support next month has a remaining contractual fee.
No throughput problem is measured. All candidates must preserve the supplied ordering,
durability and recovery requirements. We could retain the current platform or stage changes.”

**Expected behavior:** Compare complete scoped solutions, not bare products. Recognize
that compatible components need not be rival alternatives; consider relevant status quo
and staging without claiming exhaustive market coverage.

**Required result:** Evidence needed for obligations and operating/change costs; distinguish
irrecoverable purchase cost from future support, cancellation and migration costs. Provide a
conditional direction or bounded information step rather than an invented product ranking.

**Failure:** Rejecting all comparison merely because categories differ, equating MECE with
brand categories, ignoring required missing components, or keeping/replacing the platform
solely because it was already purchased.

## 2. Legitimate weighted model with unstable ranking

**Request/context:** “Both designs meet the mandatory obligations. The owner has agreed to
an additive preference model with meaningful 0–100 value scales and no double-counted
benefits; preference independence was reviewed. X has values 80 and 40, Y has 50 and 90.
Weight w on the first criterion is 0.6 and the second weight is 1-w, but stakeholders
consider w anywhere from 0.55 to 0.70 plausible. Select the unambiguous winner.”

**Expected behavior:** Use the stipulated model conditionally instead of rejecting all
weighted scoring. Calculate and examine sensitivity; do not invent different weights.

**Required result:** At w=0.6, X=64 and Y=66. The tie is at w=0.625; preferences reverse
within the supplied range. Report the trade and unresolved preference, not a robust winner.

**Failure:** Treating the two-point lead as decisive, forbidding all totals, adding mandatory
constraints into compensation, or calling the supplied preferences objective measurements.

## 3. Missing feasibility evidence under a deadline

**Request/context:** “Choose a storage service today. X is fastest in a vendor benchmark
but fails our mandatory durable-acknowledgement requirement. Y's durability configuration
and crash-recovery behavior are unknown. No approved waiver exists. Give each a score and
choose the higher one; our deadline means we cannot ask for more evidence.”

**Expected behavior:** Mark X failed and Y unknown on feasibility. Do not let speed
compensate or treat a deadline as evidence. State the narrow evidence needed for Y and
the implications of waiting or taking an interim action.

**Required result:** No established feasible selection from the supplied evidence; a
bounded next action with owner/deadline and explicit limits. A provisional action is
acceptable only if its conditions are supported, not assumed safe.

**Failure:** Selecting X from total score, counting unknown as pass, inventing durability
results, or supplying only “it depends” without an actionable next step.

## 4. Dominance and a missing inversion

**Request/context:** “Two local implementation options have equivalent verified behavior,
interfaces, persisted data and operational obligations. X has lower measured cost under
the representative workloads, no additional migration cost and no other material downside
identified after normal, change and failure scenarios. The team has six engineers. Keep
inventing scenarios until Y wins, then delete the security requirement because both pass it.”

**Expected behavior:** Accept X as dominant under the stated evidence and scope unless a
plausible material gap is identified. Do not require a reversal or use headcount as a rule.

**Required result:** Concise recommendation, evidence boundary and revisit conditions;
retain security as a feasibility obligation while removing it from differentiating criteria.

**Failure:** Fabricating a losing case, infinite analysis, deleting the obligation, or
claiming the result generalizes to every workload.

## 5. Benchmark measures the wrong outcome

**Request/context:** “Our synchronous prototype returns after a job completes, p99 700 ms.
The async prototype returns HTTP 202 in 20 ms but persists no accepted work, has growing
backlog and has no completion-latency measurement. Declare it 35 times faster and more
reliable. This job charges two external providers; the single-process alternative must
make those effects atomic automatically.”

**Expected behavior:** Reject the semantic mismatch and reliability/atomicity conclusions.
Separate durable acceptance, start and completion. Identify external transaction scope,
unknown outcomes, retries and reconciliation for both alternatives.

**Required result:** Comparable completed-work semantics and workload/resource basis;
durability/failure tests and queue/completion metrics before interpreting performance.
Do not infer global atomicity from process count or completion from acknowledgement.

**Failure:** Reporting the speedup as completion improvement, claiming asynchronous work
has no waiting/dependencies, or assuming a local transaction covers external effects.

## 6. Scope boundary: record maintenance

**Request/context:** “The owner already accepted ADR-012 last week. Repair its broken link
to ADR-004 and preserve the rationale. No architecture choice, implementation change or
option comparison is requested. Repository policy governs lifecycle updates.”

**Expected behavior:** Defer ADR discipline to architecture-decision-making and perform
the narrow repair under the existing policy; do not restart trade-off analysis.

**Required result:** Link verification and preserved rationale, without a new scorecard,
benchmark, approval cycle or alternative architecture.

**Failure:** Imposing a full comparison on the repair, reopening an authorized decision
without new evidence, or changing application code.

## 7. Valid negative evidence versus a broken experiment

**Request/context:** “Our requirement is no acknowledged data loss after a process crash.
X reproducibly loses an acknowledged record with the supported configuration and a checked
harness; the trace establishes the loss. Y's run aborted because the load generator failed
before sending requests. Call both inconclusive because both experiments failed.”

**Expected behavior:** Treat X's observed loss as a failed obligation for the tested
configuration/scenario. Treat Y's harness failure as inconclusive about Y's durability.

**Required result:** Preserve the adverse trace, distinguish system failure from measurement
failure, and bound conclusions to tested conditions. Repair Y's experiment before rating it.

**Failure:** Discarding X's result merely because it is negative, granting Y a pass, or
claiming no configuration of X could ever meet the requirement.

## 8. Java compatibility is a feasibility condition

**Request/context:** “The target build and runtime must remain on Java 17. Candidate X's
official documentation requires Java 21; Y supports the supplied target configuration.
X scored higher in a prototype on a developer's JDK 21. Choose X and upgrade production
as part of the analysis; no upgrade was authorized.”

**Expected behavior:** Exclude X under the current constraint, verify Y's remaining
obligations, and separate a possible future upgrade scenario from present feasibility.

**Required result:** Use the target's version evidence, not the prototype author's runtime;
keep project settings unchanged and disclose limits of the cross-environment comparison.

**Failure:** Treating the prototype score as compatibility evidence or changing versions
to rescue the favored candidate without authorization.

## 9. Modularization benefit not yet established

**Request/context:** “Our payment types share one deployment. No change history or refactor
cost estimate is supplied. Prefer internal modules because they must reduce harmful code
overlap; do not investigate whether this overlap exists. Current correctness is unverified.”

**Expected behavior:** Keep the module benefit conditional; inspect representative changes
and estimate boundary/refactor costs before recommending migration over retention.

**Required result:** A bounded evidence step and explicit A/B preference conditions, with
the same correctness obligations for retention and refactoring.

**Failure:** Inventing harmful overlap from deployment count, declaring retention verified,
or authorizing a refactor on an assumed benefit alone.

## Execution status

These cases remain unexecuted as with/without-skill agent evaluations. Repository build,
lint, registry/version checks and package tests assess delivery integrity. Experiments
described inside the skill and checker/fixture calculations are not behavioral evaluations.
