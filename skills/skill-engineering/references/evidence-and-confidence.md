# Evidence and confidence

Read this only for skills that **reach conclusions from evidence**: diagnosis,
troubleshooting, code review, performance analysis, incident response, security
assessment, architecture evaluation.

For a generative skill — scaffolding, formatting, refactoring, migration, writing — this
discipline is ceremony. Adding "Confidence: HIGH" to a file rename is noise, and the
sections below should not appear in such a skill at all.

## Why this matters in diagnostic work

The characteristic failure of a diagnostic agent is not being wrong. It is being wrong
_confidently_ — presenting a plausible reading of thin evidence in the same register as a
measured fact, so the reader cannot tell which they are acting on.

The fix is structural: make the skill separate what was observed from what was concluded.

## The distinction to enforce

| Level              | Meaning                                   | Test                                                      |
| ------------------ | ----------------------------------------- | --------------------------------------------------------- |
| **Evidence**       | What a tool or measurement produced       | Someone else running the same command sees the same thing |
| **Observation**    | A direct reading of that evidence         | Follows from the evidence with no domain assumption       |
| **Inference**      | A conclusion drawn using domain knowledge | Someone could disagree while accepting the evidence       |
| **Hypothesis**     | A candidate explanation not yet tested    | States what would confirm or refute it                    |
| **Recommendation** | An action, with its expected effect       | Names what to measure afterwards                          |

Never present an inference in the register of an observation. When evidence is
unavailable, the skill must say so explicitly rather than reasoning past the gap.

## Output shape

Impose this only where it earns its place — a finding that changes what someone does:

```text
Evidence:        allocation profile, 60 KB/request on POST /orders (was 4 KB)
Observation:     young-collection frequency doubled; pause durations unchanged
Inference:       allocation pressure, not collector configuration
Hypothesis:      the logging change in #4821 serialises the full request body
Recommendation:  guard the log behind isDebugEnabled; re-measure allocation per request
Confidence:      HIGH — measured before and after, single-variable change
```

Do not apply this to every sentence. A skill that formats trivia this way trains the
reader to skim past it, which defeats the purpose.

## Confidence

Three levels, each requiring a stated reason:

- **HIGH** — direct measurement, reproduced, or a single-variable change with before and
  after.
- **MEDIUM** — strong indirect evidence, or measurement from a comparable environment.
- **LOW** — static analysis only, a single unreproduced observation, or reasoning from
  documentation without observing the system.

The reason is the useful part; the label alone is decoration.

```text
Confidence: LOW
Reason: based on reading the code path only. No profile was taken, and the
        hypothesis depends on the cache being cold, which was not verified.
```

A skill that never emits LOW is not calibrated — it is suppressing the signal that would
have been most useful.

## Rules worth putting in a diagnostic skill's body

```text
IF the problem has not been measured
THEN do not present an optimisation as a confirmed fix.

IF a conclusion rests on a single observation
THEN state what would falsify it before recommending action.

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
