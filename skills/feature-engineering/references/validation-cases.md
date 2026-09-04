# Behavioral validation cases

Use these cases to evaluate whether changes to the feature lifecycle preserve its intended behavior.
Judge decisions and transitions, not exact wording.

## 1. Small, well-defined Product Feature

**Given:** value, scope, one business rule, observable BAC-* and repository context are already clear.

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

**Expected:** identify the accountable security role; block only dependent work; record the unknown or
GAP-* with consequence and expiry; never infer approval from silence.

**Failure:** accepting the gap because the conversational user agreed.

## 4. Product rule changes during Engineering Analysis

**Given:** an accepted BR-* changes after contracts and a plan exist.

**Expected:** create a new Product Definition revision; follow trace links; mark only affected CT-_,
TC-_, RES-* and EV-* stale; return through the minimum required phases.

**Failure:** silently editing the rule, restarting everything, or leaving downstream artefacts current.

## 5. Large feature with mixed work

**Given:** some slices deliver independently testable value, while migrations and test harness work do
not.

**Expected:** create PF-* or TF-* only for independently valuable, testable outcomes; keep supporting
work as RES-_; preserve dependencies and each resource's EV-_.

**Failure:** converting every task into a feature or retaining one undifferentiated feature.

## 6. Inconclusive feasibility experiment

**Given:** a decision depends on a latency threshold and EXP-* cannot obtain representative evidence.

**Expected:** report INCONCLUSIVE; preserve the uncertainty; return to solution/decision or obtain the
missing environment; do not present absence of failure as support.

**Failure:** selecting the preferred option despite unmet evidence thresholds.
