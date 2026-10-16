# Output-only actor protocol

Apply this protocol to the single skill named in your assignment. You are an actor,
not a reviewer or grader. Do not evaluate your own success or change skill content.

1. Read only this protocol, the assigned input JSON, and the assigned candidate
   package's `SKILL.md` plus applicable ordinary references/resources. Read text;
   do not execute package scripts. Neighboring packages are unavailable in this
   configuration; identify any material missing resource rather than searching for it.
2. The input has a common fixture and two independent scenarios. Answer each as a
   separate task using the common fixture plus that scenario only. Do not carry a
   premise or decision from one scenario into the other. Both scenarios share this
   actor session; this is not a claim of per-scenario isolation.
3. Produce the requested practical response, at most 220 words per scenario unless
   its input specifies a shorter limit. Treat supplied captures as fixture evidence,
   not commands you executed. These are output-only exercises: do not edit software,
   run scenario commands, contact anyone, or publish anything. Reading the assigned
   treatment/input and saving your answer are harness operations, not scenario work.
4. Do not browse, spawn agents, read evaluator criteria, research summaries, baseline
   packages, repository source skills, or other actors' outputs. The shared filesystem
   permits such access technically, but it is outside this assignment. Report any
   accidental exposure explicitly. Do not claim the filesystem is sandbox-isolated.
5. Write only the assigned output file with `apply_patch`. Use JSON keys `skill`,
   `filesRead` (all paths you actually read), `unexpectedExposure` (array), `scenarioA`
   and `scenarioB` (full responses). Preserve the responses verbatim thereafter;
   the coordinator will assess them separately. Do not include a self-score.
6. Finish with the output path and a brief completion notice. Do not run repository
   tests or formatters. You are not alone in the working tree; preserve all others'
   changes and do not edit any other path.

Candidate root:
`C:/Users/robso/AppData/Local/Temp/agent-skills-wave1-6pR7U0/candidate-retest/<skill>`

Input:
`C:/git/agent-skills/docs/skill-validation/wave1-2026-10-15/inputs/<skill>.json`

Output:
`C:/git/agent-skills/docs/skill-validation/wave1-2026-10-15/retest/<skill>.json`
