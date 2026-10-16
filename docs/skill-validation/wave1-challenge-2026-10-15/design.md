# Wave 1 challenge: pre-run design

This follow-up addresses the absence of a matched comparison in the initial wave.
It samples six consequential skills, not the whole 29-skill wave or 305-skill catalog.

- Twelve new post-freeze tasks: two per skill, with decisive constraint pairs where
  useful. Their author can inspect packages and previous cases to avoid relabeling
  a known example. Cases are unseen by the wave's earlier revision authors before
  this candidate snapshot, but are not an externally held-out production benchmark.
- Three conditions per task: no assigned skill, pre-wave original, and frozen wave
  revision. One fresh actor per task and condition, 36 runs in total. Same inherited
  model and tool availability; no model or reasoning override.
- No repeat trials in this diagnostic batch. Pair members are related problems,
  not independent statistical samples. No confidence interval or catalog-wide
  improvement percentage will be inferred.
- Six independent specialist audits run without access to these new cases. Their
  findings cannot alter the frozen comparison treatments. Any justified later
  correction requires a separately identified candidate and affected retest.
- Freeze task inputs and criteria before actors start. Preserve snapshots, hashes,
  actual outputs and failures. A task/criterion defect must be recorded and affects
  every condition equally; it cannot be silently changed to improve a score.
- Grade against explicit binary obligations. A case passes only if all its domain
  criteria pass. Word count and read-boundary reports are separate diagnostics.
  Supply graders responses with condition labels and read paths removed, permuting
  response order per case. This masks labels, not potentially recognizable prose.
- Review grader evidence against responses. Model grading remains model grading;
  it is not independent human adjudication, and shared model biases remain possible.
- Compare matched cases, retaining regressions and ties. A revised pass versus an
  original failure is an observed difference on that task, not proof of a universal
  causal effect. If every condition passes, report no demonstrated marginal gain.

This batch does not test automatic skill selection, runtime tool execution, actual
code changes, persistent memory, cross-agent compatibility or production outcomes.
No-skill means no explicit package is loaded, not a model stripped of prior knowledge
or common system instructions. Access controls are procedural and self-reported
file inventories are incomplete substitutes for an independently audited tool trace.
Exact model ID, token cost and deterministic seed are unavailable in this harness.

This design follows the repository's
[evaluation reference](../../../skills/skill-engineering/references/evaluation.md).
The distinction among tasks, trials, graders and outcomes is also described in
[Anthropic's agent evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
