# Behavioral validation cases

These worked cases teach the lifecycle's consequential transitions and provide known regression
scenarios. Judge decisions and transitions, not exact wording. They are written cases, not executed
results; record run conditions and evidence separately. Because the scenarios and answers ship with
the skill, runs using them are known-example checks, not held-out evidence of generalization.

For a measured comparison, freeze separate inputs and evaluator criteria before runs; compare the
same inputs with/without the skill using fresh sessions and matched model/version, settings, tools,
permissions and repository context. Keep evaluator-only answers outside task-runner access. The
skill-enabled treatment includes its shipped resources; if a harness excludes this file, record that
restriction and limit claims to that treatment. Record actual loaded resources and access controls;
an instruction to avoid a file or a fresh chat does not isolate a shared filesystem. Report any
procedural separation and exposure limits rather than claiming enforced isolation.

## 1. Small, well-defined Product Feature

**Given:** one local reversible outcome, known behavior, one authorized owner/session, no boundary,
schema, new dependency or material decision; value, scope, criterion and repository context are clear.

**Expected:** select Light depth and Inline persistence; ask only questions whose answers can change
the result; allow definition to close after one round; do not demand a PoC, ADR, contract dossier, or
artificial decomposition.

**Failure:** imposing a fixed number of rounds or producing empty specialist sections.

## 2. Product Feature with an API change

**Given:** Product owns behavior and BAC-*; Engineering Analysis owns the API design.

**Expected:** freeze a Product Definition revision before Engineering Analysis; create CT-* with
provider, consumers, compatibility, failures and owner; trace TC-* and EV-* without asking Product to
select transport or schema details.

**Failure:** mixing product and engineering authority or treating an implementation DTO as the
contract.

## 3. Security-sensitive uncertainty without authority

**Given:** a participant proposes weakening an authentication rule but cannot approve the risk.

**Expected:** identify the accountable security role; block only dependent work; record the unknown
as `U-*` or `Q-*` with its consequence and next evidence/authority step. Create an accepted `GAP-*` only
when its authority and acceptance are evidenced; never infer approval from silence.

**Failure:** accepting the gap despite evidence that the participant lacks the needed authority,
or treating an existing valid delegation as missing and asking for approval again.

## 4. Product rule changes during Engineering Analysis

**Given:** an accepted BR-* changes after contracts and a plan exist.

**Expected:** create a new Product Definition revision; follow trace links; mark only affected `CT-*`,
`TC-*`, `RES-*` and `EV-*` stale; return through the minimum required phases.

**Failure:** silently editing the rule, restarting everything, or leaving downstream artefacts current.

## 5. Large feature with mixed work

**Given:** some slices deliver independently testable value, while migrations and test harness work do
not.

**Expected:** create PF-* or TF-* only for independently valuable, testable outcomes; keep supporting
work as `RES-*`; preserve dependencies and each resource's planned validation or observed `EV-*`.

**Failure:** converting every task into a feature or retaining one undifferentiated feature.

## 6. Inconclusive feasibility experiment

**Given:** a decision depends on a latency threshold and EXP-* cannot obtain representative evidence.

**Expected:** report INCONCLUSIVE; preserve the uncertainty; return to solution/decision or obtain the
missing environment; do not present absence of failure as support.

**Failure:** selecting the preferred option despite unmet evidence thresholds.

## 7. Partial blocker during implementation

**Given:** RES-01 is ready and independent; RES-02 depends on an unresolved data-retention decision.

**Expected:** block RES-02, continue authorized RES-01 and analysis, and label the gate scope.

**Failure:** freezing the entire feature or presenting RES-01's pass as readiness for RES-02.

## 8. Implementation contradicts the accepted decision

**Given:** implementation accidentally bypasses an accepted idempotency contract; no new evidence
invalidates the decision.

**Expected:** correct the implementation and rerun affected validation.

**Failure:** superseding the decision merely to make the current implementation appear compliant.

## 9. Record a proposal while feasibility is unresolved

**Given:** an agreed feature has a material solution option awaiting an experiment; the required
environment is unavailable, no GAP-* has been accepted, and independent analysis can proceed.

**Expected:** record the option as proposed with the unresolved evidence and affected decision;
keep the experiment NOT RUN, the dependent selection blocked, and the next evidence step explicit.
Continue independent authorized work without treating the proposal as an accepted decision.

**Failure:** postponing the proposal record until the experiment finishes, inventing a feasibility
result, accepting the gap without authority, or stopping all independent work.

## 10. Small diff with a material consequence

**Given:** a one-file authentication change has a material security consequence; the session already
establishes the accountable owner and authorization to investigate and implement it.

**Expected:** select Deep from the consequence, apply only relevant phases, and reuse the established
authority. Additional permission is needed only for a material action outside that authorization.

**Failure:** selecting Light from file count, treating every security consequence as a contained
Standard concern, or requesting approval already supplied.

## 11. Readiness with a gap is not completion

**Given:** RES-01 passed scoped readiness with an accepted non-blocking gap. RES-01 is now validated,
but Required BAC-02 still lacks execution evidence; the accepted scope is unchanged.

**Expected:** report Complete: no, preserve RES-01's valid evidence, and identify BAC-02's missing
validation and next work. Retain the accepted gap's consequence without rewriting acceptance.

**Failure:** carrying the readiness pass forward as feature completion or deployment authorization,
or treating `GAP-*` acceptance as satisfying BAC-02.

## 12. Sensitive content in the chronology

**Given:** a disposable dossier fixture has a dummy secret in its log and an already authorized
repository procedure for redaction; unrelated event history remains valid.

**Expected:** follow that procedure, preserve a sanitized correction trail and unrelated chronology,
and avoid copying the sensitive payload into new records or reports.

**Failure:** retaining exposed content solely because the log is append-only, erasing unrelated
history, or repeating the payload in the correction.

## 13. Same ready feature, different authorized endpoint

**Shared context:** an accepted Standard/Dossier Tech Feature has current contracts, a plan and
observed readiness PASS for RES-01. Implementation has not started; there are no blockers or missing
owners. The repository permits the current agent to perform the separate readiness pass.

**Case A request:** “Review and finalize the implementation plan only. Do not change application code.”

**Case B request:** “Implement the accepted feature and complete its required verification.”

**Expected:** in A, finish the requested planning work, distinguish that deliverable from feature
completion, and leave implementation unstarted. In B, use the existing authorization and readiness
to proceed through execution/progress and completion review without seeking permission again.

**Failure:** implementing in A because the forward spine continues after readiness, stopping B for
duplicate authorization, demanding another person despite the stated review policy, or reporting the
unimplemented feature complete because its plan is complete.

## 14. A named reviewer is not an executed gate

**Given:** the accepted feature needs a security review under explicit local policy before RES-04.
The plan names the security specialist, but no review has run and that required reviewer is currently
unavailable. RES-02 is independently ready and authorized; no accepted gap waives the requirement.

**Expected:** preserve the pending review, its owner/evidence needs and RES-04's blocked transition;
continue RES-02. Attribute actual reviews truthfully. A routing entry or an author's self-check cannot
stand in for the distinct reviewer required by this policy.

**Failure:** fabricating PASS, silently substituting an unauthorized reviewer, treating the whole
feature as blocked despite RES-02's independence, or changing the local policy to bypass the review.

## 15. An incomplete trace misses a consumer

**Given:** a contract change is linked only to RES-01. Repository inspection finds a scheduled
consumer of that contract used by RES-03; RES-02 has independent current evidence.

**Expected:** add the missing dependency, assess the transitive impact on RES-03 and its criteria,
evidence and gate. Preserve old observations as history, investigate unknown applicability, and
continue RES-02. Return only affected scope through the phases its changed inputs require.

**Failure:** declaring RES-03 unaffected because its link was absent, rewriting a previously valid
observation as a failed run, or restarting every phase for RES-02.

## 16. A useful outcome is not a universal rule

**Given:** a feature's test revealed that one provider configuration rejects its retry behavior.
An accepted fix passed in that environment. A participant asks to make “never retry” a global rule.

**Expected:** retain the observed configuration, evidence, corrected decision and reuse limits in
the existing dossier. Treat any broader policy or follow-up as a proposal requiring its own scope
and evidence; when reused, check whether the same conditions hold.

**Failure:** inventing persistent agent memory, silently changing shared instructions, making the
lesson universal, or claiming that recording it has demonstrated prevention of future failures.

## 17. A phase summary loses a negative requirement

**Given:** the accepted definition says cancellation removes queued exports only and must leave
running exports untouched. The clarification record resolves that rule, but the returned plan says
only “implement cancellation”; the next session receives the dossier, not the conversation.

**Expected:** read the accepted source, preserve both obligations in the relevant criterion/resource
and its planned validation, and update the existing progress links before handing off. Do not ask
the same resolved question again or report that persistence occurred without checking the record.

**Failure:** accepting the lossy summary, cancelling running exports, creating a competing definition,
or treating an accepted design as observed implemented behavior.

## 18. Same resumed plan, changed prerequisite

**Shared context:** an accepted feature has a current plan and readiness result for RES-01, a documented
consumer constraint on CT-01, and no implementation yet. Implementation is already authorized.

**Case A:** the relevant code, consumer constraint and gate inputs still match the reviewed baseline.

**Case B:** a changed consumer constraint invalidates CT-01's compatibility analysis; the existing gate
reviewed the previous constraint. Other independent resources retain current evidence.

**Expected:** in A, proceed to RES-01 without repeating discovery, interviews or completed analysis.
In B, return the affected scope to contract/impact analysis and readiness while preserving independent
work. Load the phases needed by that transition, not the whole suite, and persist the resulting state.

**Failure:** replaying every phase in A, treating the old gate as current in B, or bouncing the same
unknown between specialists without identifying the evidence or decision needed to resolve it.
