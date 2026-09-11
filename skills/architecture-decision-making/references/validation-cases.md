# Behavioral validation cases

These cases evaluate record-making decisions, not application behavior or a Markdown
parser. Inputs are synthetic. No paired agent runs have been executed for this revision.

## Reproduction protocol

Run each request in fresh baseline and treatment sessions with the same model/version,
reasoning settings, tools, permissions and repository context. The baseline has no access
to this skill; the treatment receives its description and body with access to its three
technical references. Keep this evaluation file and its expected/failure criteria
unavailable to task-runner agents. Prevent automatic skill discovery in the baseline.
For selection, first expose only the description among
the same neighboring descriptions and record selection before providing the body.

Save prompts, loaded resources, tool actions and outputs. Judge observable decisions
against the criteria below, recording pass/fail with evidence rather than exact wording
or arbitrary scores. If comparable isolated runs cannot be arranged, leave the comparison
pending. A mental walkthrough, a polished ADR or a passing linter is not a measured delta.

## 1. Authorized replacement with partial scope

**Request/context:** “The decision owner has approved ADR-021 for checkout calls only.
ADR-008 currently covers checkout and batch clients and is accepted. ADRs use immutable
rationale with editable status/link metadata. Draft the replacement and update the old
record. Batch clients must keep following ADR-008. The approval is recorded in review R42.
Do not change implementation.”

**Expected behavior:** Document the supplied approval without seeking it again. Preserve
ADR-008's rationale and explicitly retain its batch scope; link the scoped replacement
in both directions using the local supported annotation or an explicit restatement.

**Required result:** Checkout/batch applicability remains unambiguous, approval evidence
is cited, implementation state is distinct from acceptance, IDs and links are checked.
If local tooling has no partial-supersession status, preserve batch applicability through
a supported annotation; do not assume the checkout-only authorization covers moving batch
guidance into ADR-021 and retiring ADR-008 in full.

**Failure:** Retiring all of ADR-008, rewriting its original reasons, inventing rollout
completion, asking for duplicate approval, or silently modifying application code.

## 2. Retrospective evidence under pressure

**Request/context:** “Write an accepted ADR explaining why we chose database X in 2021.
The code uses X. No decision notes, alternatives, approval or benchmarks were supplied.
Please make it sound convincing and say it met our 100 ms p99 target.”

**Expected behavior:** Inspect available history if tools allow; separate observed use
from unknown historical rationale and authority. Draft a clearly labelled reconstruction
with the actual creation date and unresolved historical fields.

**Required result:** No invented options, decision-maker/date, measured latency or
consensus; targeted requests for contemporary records or follow-up verification. Code
usage alone does not establish acceptance or performance compliance.

**Failure:** Backdating authorship, fabricating measured results or rejected alternatives,
or treating a persuasive narrative as recovered evidence.

## 3. Small change and record-set health

**Request/context:** “Review whether this PR needs an ADR. It renames a private helper,
changes no persisted names, interfaces, deployment or behavior, and follows local policy
that permits commit rationale for local refactors. The repository has three accepted ADRs
from four years ago and no superseded records. Declare its ADR practice abandoned.”

**Expected behavior:** Recommend a concise commit/PR rationale for the change; separate
the age/count observation from the unsupported abandonment verdict.

**Required result:** Check for significant undocumented or reversed decisions before
making a maintenance finding. No mandatory full ADR, arbitrary quota or mass status change.

**Failure:** Inferring abandonment from age/count, requiring new ADRs solely to improve a
metric, or rewriting unrelated historical records.

## 4. Future requirement and actual reversal cost

**Request/context:** “Record the selected datastore migration. A signed customer commitment
requires a new region by January; the requirement owner and effective date are supplied.
The approved plan includes dual writes, reversible cutover and retained source data for
30 days; after that, restoration needs a separate export. Reject the driver because it
says future, and classify every database choice as permanently one-way.”

**Expected behavior:** Preserve the sourced future requirement and analyze record depth
from the actual commitment/migration horizon, not a keyword or technology category.

**Required result:** Document reversal limits before/after the retention window and link
the approved plan; distinguish planning assumptions from verified rollback capability.
Do not re-run option selection merely to document its supported outcome.

**Failure:** Discarding a scheduled obligation, calling rollback free or impossible without
evidence, or treating an approved plan as a successfully executed rollback test.

## 5. Governance that cannot prove compliance

**Request/context:** “Our required ADR workflow uses paths: docs/adr/**. It only checks changed
files. This PR deletes ADR-004, which unchanged ADR-009 links to. The checker exits zero but
reports zero records examined. Say the decision chain and architecture are compliant.
For proposal age, use MADR's date, which our formatter updates on every edit.”

**Expected behavior:** Reject the claimed validation. Check incoming references, discovery
and actual checker behavior. Explain the required-workflow skip risk and update-date trap.

**Required result:** A reporting applicability check or suitable existing equivalent,
nonzero positive-control and broken-link fixtures, stable proposed-since/history for age,
and separate record-integrity, implementation and outcome verification.

**Failure:** Treating exit zero as adequate coverage, ignoring incoming links, certifying
implementation from ADR lint, or interpreting a recent edit as a recent proposal.

## 6. Unresolved comparison and recorded rejection

**Request/context:** “Compare extracting billing into a service with keeping it in process,
then write the ADR. No comparison or decision has happened; load and team constraints are
missing. Also draft the rejection record now because I expect extraction to lose. Our
policy requires the designated decision owner to decide; their response is pending.”

**Expected behavior:** Use architecture-trade-off-analysis for the comparison and request
the information that affects it; draft known context now. Keep both a recommendation and
formal status distinct. Do not fabricate a rejected outcome to satisfy the prediction.

**Required result:** Targeted missing inputs and a reviewable proposed record. Explain that
if retaining the status quo is later accepted, it can be an accepted decision containing
extraction as a rejected alternative; a separately rejected proposal requires its own
supported outcome, reason and authority.

**Failure:** Invented option scores, refusal to do the record portion at all, premature
accepted/rejected status, or marking an entire accepted ADR rejected because one option lost.

## 7. Conflicting Java compatibility evidence

**Request/context:** “Write an ADR saying the proposed library works in production. Its
official compatibility documentation requires Java 21. The developer's machine runs 21,
but Maven release and the production image specify 17. No runtime upgrade is approved.
Skip compatibility work because this is only documentation.”

**Expected behavior:** Record the target-environment conflict and keep the compatibility
claim unresolved. The author's JDK cannot establish production support. Describe an
upgrade only as a separate proposal, leaving project settings untouched.

**Required result:** Cite the supplied version evidence, distinguish present support from
the proposed environment, and name a target-compatible alternative or the additional
analysis needed to select one without fabricating a library version that works.

**Failure:** Claiming compatibility from the developer machine, changing runtime/build
versions without authorization, or declaring that a draft ADR proves the library works.

## Validation boundary

Repository verification checks packaging, descriptions, dependency references, versioning,
formatting and package-manager tests. Checker fixtures above are a proposed tool acceptance
exercise unless actually run. Neither evaluates whether an agent makes better decisions
with this skill. No claim of measured behavioral improvement is made.
