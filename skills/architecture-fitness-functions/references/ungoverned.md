# Partial coverage, manual review and the register

## Avoid an all-or-nothing governance claim

Start with the characteristic's scenario and the failure/change it must withstand. Name the
observations that support it, the judgement required and the parts still unseen. A composite
does not require a fixed decomposition: pick relevant sub-outcomes and preserve any mandatory
ones rather than averaging them into a passing score.

Before marking a concern uncovered, distinguish:

- **Not yet defined:** meaning/threshold is missing; elicit it and mark the proposed check pending.
- **Not automated:** a repeatable manual rubric or scheduled exercise may be appropriate.
- **Partially covered:** list controls and their blind spots without claiming complete coverage.
- **Uncovered:** record the specific risk, owner, review date and reconsideration trigger.

A deterministic check can detect some semantic or workflow defects when given an explicit
contract, model or fixture. Conversely, an LLM review is not proof that unstated architectural
intent holds. When using advisory model output, retain cited evidence and human escalation;
calibrate the rubric and model/version on known cases before treating verdicts as decisions.

## Register schema

Use the existing team record if it captures these decisions; JSON is optional. The bundled
checker accepts a JSON object with a nonempty entries array. Its modes are local metadata
conventions: T (automated triggered, including scheduled), C (automated runtime), M (manual),
and none (uncovered concern). Use separate entries for multiple controls on the same
characteristic. The root quantum field can describe the agreed protected scope; it is not
a claim that the checker verifies architectural boundaries.

Example for evaluation on **2026-09-05**; dates and targets are illustrative, not a policy to adopt:

```json
{
  "quantum": "order-intake",
  "reviewed": "2026-09-01",
  "entries": [
    {
      "id": "FF-01",
      "characteristic": "dependency direction",
      "governance": "T",
      "metric": "new domain-to-infrastructure dependencies in imported production classes",
      "threshold": "zero new violations under ARCH-POL-2",
      "site": "PR test phase",
      "consequence": "block merge; architecture owner reviews any scoped exception",
      "owner": "order-intake lead",
      "review": "2027-02-01"
    },
    {
      "id": "FF-02",
      "characteristic": "availability",
      "governance": "C",
      "metric": "successful eligible order-acceptance requests over the agreed window",
      "threshold": "target and minimum evidence requirements in SLO-2",
      "site": "production monitor",
      "consequence": "invoke SLO-2 response policy; missing telemetry opens an investigation",
      "owner": "service on-call",
      "review": "2027-02-01"
    },
    {
      "id": "FF-03",
      "characteristic": "maintainability: domain ownership",
      "governance": "M",
      "metric": "representative changes reviewed against ownership rubric R-3",
      "criterion": "record supported ownership violations and unresolved evidence",
      "cadence": "monthly",
      "lastVerdict": "2026-08-04",
      "consequence": "lead assigns corrective work or records an approved exception",
      "owner": "domain lead",
      "review": "2027-02-01"
    },
    {
      "id": "GAP-01",
      "characteristic": "unreviewed workflow coupling",
      "governance": "none",
      "risk": "cross-team release coordination outside sampled workflows is not inspected",
      "owner": "domain lead",
      "review": "2027-02-01",
      "trigger": "new participating service or coordination-related incident"
    }
  ]
}
```

Every entry requires a nonblank characteristic and owner, a real review date on or after the
evaluation date, and a recognized mode. T/C require nonblank metric, threshold, site and
consequence. M requires metric, criterion, cadence, lastVerdict and consequence. none requires
a nonblank risk. Required text fields must be strings, not arrays, objects or whitespace.

Review dates are inclusive UTC calendar dates. M lastVerdict must be real and no later than
today. Supported cadence limits are elapsed days, deliberately including grace; these are
local checker policy, not exact calendar intervals or a universal governance standard:

| Cadence     | Maximum elapsed days |
| ----------- | -------------------- |
| weekly      | 8                    |
| fortnightly | 15                   |
| monthly     | 32                   |
| quarterly   | 94                   |
| half-yearly | 185                  |
| annually    | 367                  |

If root reviewed is present, it must be a real date no later than today and within 367 days.
It is optional for compatibility; use it when the team wants the overall review-age check.
IDs, scope, links to verdict evidence, exception expiry and triggers should be reviewed by the
team; this checker does not validate their semantics, uniqueness or cross-record consistency.

A lastVerdict is only the date of a recorded review, not the verdict itself. Keep actual outcome,
evidence and follow-up in a linked record. Pending controls can be documented as uncovered with
the gap and plan; do not invent a past verdict to make the register pass.

## Run and interpret the checker

From this skill directory:

Use the repository's supported Node.js baseline (22.18.0 or later); the checker and tests use
built-ins only and do not require a Java toolchain.

```text
node scripts/check-governance-register.mjs path/to/register.json
node scripts/check-governance-register.mjs path/to/register.json --today=2026-09-05
node --test scripts/check-governance-register.test.mjs
```

The override makes tests reproducible; scheduled operational checks should use actual current UTC
time. Run on register edits as well as on a schedule, since records change and dates expire.

Exit 0 means the specified metadata checks passed. It does not mean the controls executed,
the metric covers the characteristic, or an owner accepted risk. Exit 1 reports invalid/stale
entries (including an empty register); exit 2 reports invalid arguments, unreadable/invalid JSON
or a root without an entries array. No command writes to the register.

The accompanying node:test cases exercise the checker and this example. They are explicitly
invoked by the command above; the repository's package test glob does not discover them.
They do not evaluate the skill's effect on an agent.

## Review and exceptions

Revisit controls after relevant incidents, scope/requirement changes, tool upgrades or evidence
of false positives/negatives, as well as at the agreed review date. A waiver needs scope,
reason, approving authority, expiry and compensating action; the register validator does not
grant approval or enforce such a waiver.

A failed scan or stale verdict does not mean the protected system is known to be defective.
It means assurance is unavailable or out of date. Decide the consequence in advance according
to risk, and report that distinction. Do not loosen metadata validation to hide an overdue task.
