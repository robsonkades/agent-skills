# Evidence and confidence

Read this for skills that **reach conclusions from evidence**: diagnosis,
troubleshooting, code review, performance analysis, incident response, security
assessment, architecture evaluation.

Refactoring, migration and other generative tasks also depend on evidence about contracts,
versions and existing behavior. Apply the discipline where an assumption affects correctness;
adding a confidence label to a routine file rename remains unnecessary.

## Why this matters in diagnostic work

The characteristic failure of a diagnostic agent is not being wrong. It is being wrong
_confidently_ — presenting a plausible reading of thin evidence in the same register as a
measured fact, so the reader cannot tell which they are acting on.

The fix is structural: make the skill separate what was observed from what was concluded.

## The distinction to enforce

| Level              | Meaning                                    | Test                                                                |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------- |
| **Evidence**       | A captured artifact, source or measurement | Record provenance, versions, time and conditions; reruns can differ |
| **Observation**    | A direct reading of that evidence          | States the visible result within the artifact's coverage            |
| **Inference**      | A conclusion drawn using domain knowledge  | Someone could disagree while accepting the evidence                 |
| **Hypothesis**     | A candidate explanation not yet tested     | States what would confirm or refute it                              |
| **Recommendation** | An action, with its expected effect        | Names what to measure afterwards                                    |

Never present an inference in the register of an observation. When evidence is
unavailable, the skill must say so explicitly rather than reasoning past the gap.

## Output shape

Impose this only where it earns its place — a finding that changes what someone does:

```text
Evidence:        allocation captures plus GC logs under comparable load/windows
Observation:     allocation rose from 4 to 60 KB/request on POST /orders
Observation:     young-collection frequency doubled; pause durations unchanged
Inference:       increased allocation is a candidate contributor; causality is not isolated
Hypothesis:      the logging change in #4821 serialises the full request body
Recommendation:  inspect logging argument evaluation and level; test a targeted change
Limit:           before/after correlation alone does not identify the allocation source
```

Do not apply this to every sentence. A skill that formats trivia this way trains the
reader to skim past it, which defeats the purpose.

## Confidence

Confidence attaches to a **specific claim**, not a tool category. A version-matched API
contract or conclusive static proof can strongly support a language/API claim. A production
measurement supports the observed workload and capture; it does not automatically establish
causality or predict other environments. Neither proves an agent will follow a skill.

If labels help the reader, define their meaning for the task and give the reason. Prefer
the actual support and limitation over mandatory HIGH/MEDIUM/LOW labels. Do not require a
distribution of labels to make a report look calibrated.

```text
Supported: a named API's version-matched contract explicitly rejects null values.
Unverified: whether the application reaches that path with null in production.
Next evidence: inspect the caller's input contract or reproduce that input.
```

For missing data, report unknown and what evidence would resolve it. An absent event or
successful test supports absence only within known coverage and sensitivity. Keep runtime,
contract and performance claims separate.

## Rules worth putting in a diagnostic skill's body

```text
IF the problem has not been measured
THEN do not present an optimisation as a confirmed fix.

IF a conclusion rests on a single observation
THEN limit the claim to what that observation supports; name a discriminating check
when causal interpretation or generalization matters.

IF the evidence is unavailable or the tool failed
THEN say so explicitly; do not substitute plausible reasoning silently.

IF a recommendation is made
THEN name the measurement that will show whether it worked.
```

## Tool strategy

Prefer tools that produce objective evidence over those that produce plausible narrative.
For each tool the skill relies on, the body should state when to reach for it, what
evidence it yields, and — the part usually omitted — what it _cannot_ show.

Knowing a profiler's blind spot is what prevents an absence of evidence from being read
as evidence of absence.
