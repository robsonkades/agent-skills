# Evidence and tooling

Read when reviewing an existing decision set or proposing checks. A linter can verify a
record's structure and references; it cannot determine whether its rationale was honest,
the decision was authorized, or its expected system outcome occurred.

## Three distinct things to verify

| Layer                    | Evidence to inspect                                                                                    | What passing establishes                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Record integrity         | Recognized ID/status, required fields, resolved links, consistent replacement graph                    | The record can be read and navigated under local conventions                     |
| Implementation adherence | Relevant code/configuration, architecture tests, migration review or explicit manual inspection        | The examined implementation follows the stated decision within the checked scope |
| Outcome and assumptions  | Workload measurements, incident/change evidence, stakeholder acceptance or monitored review conditions | Whether the intended benefit or assumed context holds in the observed conditions |

An ADR checker must not be described as validating the implementation merely because it
passes. An architecture test must name the actual dependency or behavior it constrains.
A benchmark must compare the intended metric and workload, not a convenient proxy.
Design of ongoing fitness functions and responses to failures belongs to
`architecture-fitness-functions`; the ADR links the selected checks and owners.

## Review the set from discrepancies

Start with decisions relevant to the current change and their incoming/outgoing links.
For a broader review, sample significant changes, existing records and team questions.
Separate direct observations from hypotheses about maintenance.

| Observation                         | Hypothesis, not verdict                   | Evidence that would confirm or refute it                                                                        |
| ----------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Few records or no recent additions  | Significant decisions may be undocumented | Compare significant changes and their commit/issue rationale; stable design may explain the quiet log           |
| All records remain accepted         | Replacements may be missing               | Find actual reversed choices; no supersession is needed if they still apply                                     |
| One author wrote most records       | Knowledge ownership may be concentrated   | Inspect review participation, handover and whether others can retrieve the rationale                            |
| Consequences list only benefits     | Costs may have been omitted               | Ask about migration, operational burden and uncertainties; a dominant option need not have an invented drawback |
| Old proposed records                | Decision may be stalled                   | Check owner, dependencies, review commitments and whether it was deliberately deferred                          |
| Code conflicts with an accepted ADR | Drift or an undocumented replacement      | Inspect scope/exceptions, adoption state and authorized changes before treating code as a violation             |

There is no catalog-wide quota of ADRs per year, ceiling of 100 records, minimum author
count or age after which accepted decisions automatically expire. Practitioner examples
and adoption correlations cannot establish those policies. Do not infer from a few searches
that no outcome evidence exists anywhere; state what evidence this review actually has.

## Select or configure checks by behavior

Prefer the repository's working checker and format. Before recommending another tool,
inspect its primary documentation and pinned implementation/version, supported headings,
status grammar, file discovery, cross-reference handling and exit behavior. Check current
maintenance and dependencies if adoption is in scope, but do not turn star counts or a
last-commit date into a capability or security verdict.

Exercise a checker with deliberately valid and invalid fixtures. Minimum useful probes:

| Fixture                                                            | Required observable result                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Valid short record in the repository's actual format               | Discovered and accepted; reported file count is nonzero                     |
| Superseded record without a replacement                            | Fails the configured relationship rule                                      |
| Link to nonexistent ADR, including a target removed in this change | Fails; incoming references from unchanged records are checked               |
| Self-supersession or a replacement cycle                           | Fails a graph check if that protection is claimed; otherwise record the gap |
| Correct lifecycle-only status/link update                          | Passes without demanding rewritten historical context                       |
| Non-ADR Markdown or a compact record allowed by local policy       | Not forced into an unrelated template                                       |

A required check that examines only changed files can miss an unchanged ADR linking to
a deleted/renamed target. Determine impacted incoming references or scan the decision
directory. Baseline legacy violations explicitly if adopting a new check; do not claim
the baseline means the old records are valid.

Do not require contiguous numbering unless local tooling actually needs it. Stable unique
IDs matter for links; a gap is not evidence that rationale was deleted. Do not enforce
“at least two options” when only one was feasible, or when the task is historical recovery
and alternatives are unknown. Field-presence checks cannot establish comparison honesty.

These are acceptance criteria for a checker, not a promise that any particular product
implements all of them. If the needed check is unavailable, state the manual check or
implementation gap. Do not invent a tool, rule identifier or successful command output.
Do not build new automation for one ADR when a direct review is sufficient.

## Review timing and pull-request integration

A revisit trigger needs an observer, evidence source and action. For aging proposals,
use a creation/proposed-since date or status history: an update-date field may reset after
a typo and hide how long the proposal has waited. Choose a review reminder from the team's
cadence. It need not fail unrelated changes or relabel a delayed proposal as abandoned.
Use periodic review as well when important assumptions cannot be monitored directly.

If a path-sensitive ADR check is required in GitHub, ensure the required result reports
for every relevant PR. Skipping a whole workflow using path/branch filters or commit-message
rules can leave its required check pending. Prefer a reporting job with an internal
applicability decision; verify that upstream failures cannot become a success through a
skipped dependent job. See
[GitHub's required-check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

A change to a watched path can implement an existing accepted decision. Require a link
to the applicable record or a justified local exemption when the policy calls for it;
do not require a new ADR for every such change. A citation is a discovery aid, not proof
that the cited decision covers the change. Use code comments, module documentation, PR
links or an index according to how readers reach the relevant boundary.

## Reporting confidence and limitations

For a material review finding, report the observed record/code evidence, the inference,
the consequence and what would resolve uncertainty. Examples:

- “ADR-009 links to a removed file” is a direct integrity finding.
- “The team abandoned ADRs because the last record is old” is an unsupported inference
  until significant undocumented decisions are identified.
- “The recorded p95 benchmark proves the p99 target” is a metric mismatch, even if the
  benchmark itself is real.
- “This revision improves decision quality” requires behavioral evaluation, not a count
  of fixed links or completed template fields.

The primary sources in the lifecycle reference document conventions and process choices.
This revision does not claim measured reductions in defects, rework or decision time.
Use `validation-cases.md` for paired skill evaluations and report executed checks
separately from evaluation plans.
