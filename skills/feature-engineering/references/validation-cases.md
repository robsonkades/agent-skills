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
