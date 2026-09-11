# Evidence, disagreements and behavioral evaluation

## Claims this skill can support

[Thoughtworks' architectural fitness function description](https://www.thoughtworks.com/radar/techniques/architectural-fitness-function)
provides the assessment concept and explicitly includes existing verification mechanisms.
Whether this is new vocabulary or a new discipline does not decide which check is useful.

Primary tool documentation establishes capabilities, not the outcomes of adopting a suite.
For example, [ArchUnit](https://www.archunit.org/userguide/html/000_Index.html) documents bytecode
analysis and generic type models. Do not assume type erasure makes every generic signature
uninspectable: inspect the tool's model and the actual compiled artifact before claiming a
specific rule cannot be expressed.

No controlled efficacy comparison was performed for this revision. This is a limitation of
the work, not a claim that no relevant study exists anywhere. Retained guidance is a design
proposal supported by identifiable failure mechanisms, tool documentation and checker tests.
It does not establish better delivery outcomes or lower maintenance cost.

When a rule appears costly, capture execution time, blocking delay, false positives, escaped
violations, override frequency and maintenance effort. Compare against its detection value and
a concrete replacement. A quiet rule may be preventing violations; a frequently red rule may
be correct. Neither frequency alone proves value or uselessness.

## Reproducible behavioral cases

Status: documented, not executed. The checker tests are separate code-level evidence.

For each request/context below, use fresh sessions with the same model/version, settings,
tools and surrounding instructions. Omit this skill for the baseline; supply SKILL.md and
access to references for treatment. In the isolated evaluation copy, remove this reference's
`## Reproducible behavioral cases` heading and everything after it from agent-accessible
resources; retain the preceding technical and source guidance. Keep the full cases and other
evaluation artifacts private to the evaluator in both arms, supplying only the selected
request/context to the agent. Record outputs/tool calls and pass/fail per required
characteristic with evidence, not a wording match. For selection, keep neighboring
descriptions constant and add this description only in treatment.

### 1. A check that reports but cannot block

**Request/context:** “Our Dependency-Check Maven job generates a report and exits zero when a
known fixture contains a high finding. Effective failBuildOnCVSS is 11. Policy requires fixing
existing highs within 14 days from discovery; no rule forbids introducing them on day zero.
Review the governance and show what validation is needed.”

**Expected behavior:** Separate detection, CI response and remediation policy.
**Required output:** Identify ineffective score blocking, request deadline/exception handling,
and propose a safe failing-fixture check through actual CI wiring.
**Failure:** Treating report generation as enforcement, inventing a day-zero prohibition or
claiming the fixture proves general security.

### 2. One contributor and multiple controls

**Request/context:** “One engineer owns a payment service. Keep its domain dependency rule,
nightly released-artifact scan and runtime success monitor, or retire everything because only
one person can merge? Security needs both scheduled and PR checks.”

**Expected behavior:** Evaluate risk, external drift and existing coverage; allow complementary
controls for the same characteristic.
**Required output:** Retention/retirement rationale tied to evidence and a control-to-property map.
**Failure:** Retiring based solely on contributor count or forcing exactly one governance mode.

### 3. Missing data under deadline pressure

**Request/context:** “Latency monitor is green because it saw no traffic. The scan feed is stale.
A performance check is rerun until it passes. Release is tomorrow; mark all three passed.”

**Expected behavior:** Distinguish unavailable evidence, variable measurements and valid passes.
**Required output:** Minimum data/freshness requirements, reproducibility investigation and the
existing release/exception owner and policy; no invented successful execution.
**Failure:** Treating no samples as success, silently accepting reruns or choosing a convenient
new threshold.

### 4. Maintainability proxy and human review

**Request/context:** “Cyclomatic complexity is below our limit everywhere, but reviewers report
domain ownership drift. Certify maintainability from the score, or mark it entirely ungoverned
because semantic review needs judgement.”

**Expected behavior:** Explain partial coverage and propose a rubric/evidence review where useful.
**Required output:** Specific residual, manual review criterion and escalation, plus limitations.
**Failure:** Certifying the umbrella from one proxy, treating all judgement as ungovernable, or
claiming an LLM score alone settles architectural intent.

### 5. Frozen baseline and authorized exception

**Request/context:** “We intentionally require no new dependency violations. ArchUnit's frozen
store still has 20 old violations after a year. A new urgent change adds one. We can silently
refreeze or record an owner-approved exception expiring next week. No debt-reduction deadline exists.”

**Expected behavior:** Distinguish the valid no-new policy from debt reduction; reject silent
refreezing and evaluate the scoped exception under existing authority.
**Required output:** New violation remains visible, exception scope/expiry/compensating action,
and no invented obligation to reduce the original 20 on a schedule.
**Failure:** Claiming FreezingArchRule forces timed reduction, disabling the rule wholesale or
refusing every temporary exception as inherently invalid.

### 6. Scope boundary

**Request/context:** “The architecture and zero domain-to-infrastructure dependency rule are
approved. Write the ArchUnit assertion and integrate it with our JUnit setup.”

**Expected behavior:** Route test implementation to architecture-testing; use existing governance.
**Required output:** Respect approved rule and implementation inputs.
**Failure:** Reopening characteristic selection or imposing a new governance workshop first.
