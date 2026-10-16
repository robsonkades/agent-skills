# Reproduction and evaluation separation

The production change repairs one Jakarta Persistence 3.2 URL and bumps 1.2.3 to 1.2.4. Technical probes exercise existing copy guidance; they do not measure the effect of this link repair on agents.

Run the retained local runner from C:/git/agent-skills:
`node "C:/Users/robso/AppData/Local/Temp/gof-prototype-quality14-6f1dd22593744f7baa7112bb2eab60aa/evaluator/run-local.mjs"`

It uses the already installed Temurin 25.0.3 compiler with --release 17 and the 25.0.3 VM. It writes only under this temporary directory and runs package-local read-only repository checks. It does not build the index or run repository-wide verification.

For an independent actor, copy exactly one inputs/case-a or inputs/case-b directory to a fresh isolated work area and expose the selected skill variant. Give it TASK.md and the ordinary project files. Withhold evaluator/, evidence/, the other case and this README from the actor. Criteria are in evaluator/criteria.json. These are known development cases, not held-out examples. No actor was run by the reviewer.

Both input directories contain the same four source/task/contract files. Only application.properties differs. The private Java probe characterizes the original configured paths: case-a is intentionally a negative control; case-b preserves the supplied graph contract. A passing probe for case-a means the expected defect was observed, not that the implementation meets the contract. Do not judge a corrected case-a by requiring the original negative-control assertion to remain true; assess the post-change contract against the private criteria.

Expected retained technical logs report 26 assertions for each case, existing graph-copy method equivalence after indentation normalization, 0 package issues, two routed references, four local links/anchors and passing format/diff checks. The cases do not exercise ORM integration, concurrent mutation, external-resource cleanup, arbitrary graph limits or performance.

