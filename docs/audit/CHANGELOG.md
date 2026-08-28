# Phase 3 — corrections applied

Companion to [AUDIT.md](AUDIT.md) and [GAPS.md](GAPS.md). Every entry maps to a finding id.
Applied 2026-08-28. Verified against Temurin 25.0.3+9 / 25.0.4+7 and the repository's own CLI.

**Not done, deliberately:** the `adapter-pattern` rename (m-01) — it breaks a published name and
was not approved. The four proposed new skills (G-01…G-04) are in the `SKILLS.md` roadmap rather
than built, which is where Phase 4 places approved-but-unimplemented gaps.

---

## B-01 — four skills were uninstallable

`^1.0.0` → `^2.0.0` on the `architecture-decision-making` dependency in four manifests:
`domain-logic-organization`, `enterprise-application-architecture`,
`framework-coupling-and-independence`, `layering-and-boundaries`.

`^2.0.0` rather than `>=1.0.0` because the `2.0.0` bump was a scope narrowing, so the range should
express that these four depend on the narrowed skill.

**Verified:** all four now resolve. `agent-skills install domain-logic-organization --dry-run`
prints the full plan (`architecture-decision-making@2.0.0` as a dependency) and exits 0, where it
previously exited on `ASK_DEPENDENCY_CONFLICT`.

## B-02 — develop-only flags presented as a workflow step

`skills/c2-sea-of-nodes/SKILL.md` step 4 and
`skills/c2-sea-of-nodes/references/jit-diagnosis-recipes.md`.

- The workflow step now scopes `-XX:+PrintEscapeAnalysis` / `-XX:+PrintEliminateAllocations` to a
  debug build and names the product-JVM alternative in the same breath.
- The reference now shows the actual refusal transcript before the command, states the debug-build
  requirement, and routes the product-JVM reader to allocation profiling. The decision-tree block
  gained a product-JVM row so the tree is usable on a shipping runtime.
- Cross-reference added to `escape-analysis-internals`, which already stated the requirement
  correctly — the internal inconsistency the finding identified is closed.

## M-03 — flags documented as live that do not exist

Found as one flag; three turned out to be the same defect, all confirmed by execution on
Temurin 25.0.3. The audit's re-triage of all 190 cited flags found the extra two.

| Flag | Reality on JDK 25 | Replacement written in |
| --- | --- | --- |
| `-XX:+G1EagerReclaimHumongousObjects` | `Unrecognized VM option`; refuses to start | `-XX:G1EagerReclaimRemSetThreshold` (experimental, 32) — the eligibility cut-off that survives |
| `-XX:+G1SummarizeRSetStats` | `Unrecognized VM option`; refuses to start | `-XX:G1SummarizeRSetStatsPeriod=<n>` (diagnostic, default 0) |
| `-XX:ShenandoahMaxSATBBufferSize` | `Unrecognized VM option`; the JVM itself suggests the right name | `-XX:ShenandoahSATBBufferSize` (experimental, 1024) |

Files: `g1-concurrent-marking/SKILL.md`,
`g1-concurrent-marking/references/marking-cycle-log-and-flags.md` (table row, the `grep` recipe,
and the prose), `zgc-and-shenandoah/references/flags-and-modes.md`.

A fourth, `-XX:+PrintSafepointStatistics`, was **recommended as a live diagnostic** in two places
while two other skills correctly described it as gone. All three now agree: it is removed, the JVM
refuses to start on it, and the output lives on as `-Xlog:safepoint+stats=debug` (verified to emit
the table). Files: `jni-and-ffm/references/critical-and-decision-matrix.md`,
`jni-and-ffm/references/pinning-and-native-access.md`, `safepoints/SKILL.md`,
`safepoints/references/instrumentation.md`.

`UNVERIFIED`, unchanged: the exact release in which each became obsolete. No JDK below 25 is
installed here. Every correction states the observed JDK 25 behaviour rather than guessing a
release.

## M-05 — the format contract now requires the descriptions to agree

Done **before** M-01, so the repair cannot silently undo itself.

- New error-level rule `skill.description.mismatch` in
  `packages/core/src/application/validate-package.ts`, with a `collapse()` helper so a folded YAML
  scalar and a quoted one are not reported as a mismatch.
- Two tests in `packages/core/test/application.test.ts`: one that the mismatch is caught, one that
  whitespace alone is not.
- `docs/skill-format.md`: the rule is in the validation table, and the "Consistency is enforced by
  validation" paragraph now states *why* — only the manifest description ships — and which file to
  edit.

**Verified end to end:** a copy of `gc-fundamentals` with a one-word change to its frontmatter
description now fails `validate` with `skill.description.mismatch` and exits non-zero.

Option (b) from the audit — making `skill.yaml` the single source and dropping the frontmatter
description — remains open. It is the permanent fix; this is the non-breaking one.

## M-01 / M-02 / M-04 — the description layer

All three are one repair, done together because they interact.

**Result: 0 of 240 skills drift, and 0 of 240 exceed 1024 characters.** Before: 162 drifted, 13
over. Range is now 496–1024 characters.

How the 162 were handled, by class:

| Class | Count | Treatment |
| --- | ---: | --- |
| Frontmatter ≤1024 and a superset of the manifest's routing pointers | 101 | Adopted the frontmatter wholesale into both files — restores everything the trim had removed, no judgement needed |
| Manifest ≤1024 and losing nothing | 20 | Copied the manifest down into the frontmatter |
| Genuine merges | 41 | Rewritten by hand |

The 41 hand-written merges were the ones where the manifest had been trimmed below the frontmatter
*and* the trim had cost named routing pointers, or where the text was over 1024 to begin with.
Every one was rewritten to keep both the trigger list and the full boundary clause inside the
limit; where that was impossible, trigger conditions were kept and boundary phrasing was
compressed (`Does not cover X (skill)` → `Not X (skill)`), never the reverse.

Four skills that were shipping **no trigger clause at all** — scope and boundary only — were
rewritten to restore one: `java-application-security-basics`, `java-clean-code`,
`java-code-smells`, `refactoring-automation`. The security one recovered the symbol-level triggers
(`MessageDigest`, `SecureRandom`, `PasswordEncoder`, `@PreAuthorize` on a controller with a second
caller) that had been deleted to fit the limit.

**77 skills had lost at least one named routing pointer**, all now restored. The largest was
`distributed-failure-catalogue`, whose whole purpose is routing and which had lost all ten of the
owners it names; it now names the principal ones and keeps the "every entry routes to its owner"
contract.

Two descriptions were ordered boundary-first, so truncation removed the entire trigger list:
`concurrent-collections-and-synchronizers` (1373 chars) and `schema-evolution-and-compatibility`
(1361). Both reordered to trigger-first and cut to 1019 and 993.

Method note: descriptions were written through a helper that refuses to write anything over 1024
characters, so no edit in this pass could reintroduce M-04. Both files are written from one source
string, so no edit could reintroduce M-01.

## m-03 — the unsupported speed ratio

`skills/tail-latency-analysis/references/attributing-the-tail.md`. The bare "typically 10–100x
slower than compiled code" is replaced with a qualitative statement plus the measurement to take
(`-XX:TieredStopAtLevel=0` against the default, verified to start on Temurin 25.0.3). Per the
brief's rule, one guess was not swapped for another. This also removes the contradiction with
`jvm-bytecode`, which criticises exactly this shape of claim.

## Not applied

| Finding | Why |
| --- | --- |
| m-01 — rename `adapter-pattern` | Breaking change to a published name; awaiting your answer |
| m-04 — what `dependencies` means | A documentation decision, not a defect, until you settle the semantics |
| n-01 — the ambiguous bare `references/…` path | Cosmetic; the file exists and the prose names its owner |

---

## Verification after the whole pass

```
npm run build              ✓
npm run check:boundaries   ✓  7 packages
npm run lint               ✓
npm run test:only          ✓  302 tests, 0 failures
npm run registry:check     ✓  240 skills, up to date
agent-skills validate --strict, all 240 skills   ✓  0 issues
```

`npm run format:check` still fails repo-wide, on **7 files that are not part of this work**:
five under `docs/skill-validation/` and two under `docs/validation/architecture/`. They are
untracked, belong to concurrent work in this tree, and were left untouched deliberately — the same
situation the previous delivery record describes. Every file this pass touched is Prettier-clean.

## Corrections to AUDIT.md itself

Two counts in the audit were wrong and are corrected in place:

- **M-02 said "six skills ship with no trigger clause".** It is **four**. `coding-agent-discipline`
  and `requirements-and-acceptance` open their trigger clause with "Use *before*…", which the
  detection regex did not match. Neither needed a change.
- **M-02 said "21 skills lose their boundary clause".** That came from a phrase-shaped regex that
  missed the repository's other boundary forms ("X is skill-a", "Detection only — …"). The
  accurate measure, taken by comparing the set of *skill names mentioned* in each pair of
  descriptions, is **77 skills losing at least one named routing pointer** — a larger problem than
  reported, and the number the repair was actually sized against.

---

# Follow-up pass — roadmap items and a defect I introduced

## Tooling: `registry:check` now resolves dependency ranges

`scripts/build-registry-index.mjs` gained a range check. It is the one place that sees every
published version at once, which is exactly what `validate` cannot do — and that blind spot is how
B-01 stayed green.

**Verified by reintroducing the defect:** setting `layering-and-boundaries` back to `^1.0.0` makes
`npm run registry:check` fail with

```
error: 1 dependency range(s) cannot be satisfied:
  - layering-and-boundaries requires architecture-decision-making@^1.0.0, but the only published version is 2.0.0
```

and restoring `^2.0.0` makes it pass. B-01 can no longer recur silently. Optional dependencies are
allowed to be unpublished; required ones are not.

## m-02 — the "which pattern fits" trigger now has one owner

Three skills claimed a near-identical trigger phrase. The cheap, reversible option from the audit
was taken rather than merging the skills:

| Skill | Before | After |
| --- | --- | --- |
| `gof-pattern-selection` | "when someone asks which pattern fits" | unchanged — sole owner |
| `gof-pattern-thinking` | "when someone asks which pattern fits here" | replaced with "when an indirection needs pricing before it is adopted" |
| `pattern-selection-and-composition` | "which patterns a new module should use" | "which **enterprise** patterns a new module should use" |

The structural alternative — folding `gof-pattern-thinking` into `gof-pattern-selection` — remains
open and is still the cleaner fix.

## A defect I introduced, and the recovery

While adding the over-length guard to my own scratch helper, a `sed` swallowed a backslash and
turned `.replace(/\s+/g, ' ')` into `.replace(/s+/g, ' ')`. Every description written through that
helper afterwards had **all its `s` characters replaced with spaces** — "Choosing enterprise
patterns" became "Choo ing enterpri e pattern ".

**Scope: 48 of 240 descriptions.** It passed every gate. `validate` has no rule against it, lengths
still looked plausible (the corrupted text is shorter), and the round-trip was never checked.

Found while reading `pattern-selection-and-composition` for the m-02 edit.

**Recovery:**

- 22 skills were restored exactly, by re-running their original patch against the pre-edit baseline
  dump of all 240 descriptions taken before Phase 3 began.
- 26 were rewritten from source. Their target lengths shifted slightly, because the earlier
  "under 1024" measurements had been taken on the corrupted (shorter) text — several needed a few
  more characters trimmed than the first pass suggested.
- The helper now re-reads both files after writing and fails if the parsed description does not
  round-trip to the input.
- `SKILLS.md` was regenerated, because its dictionary had been built from corrupted text.

**State after recovery, over all 240:** 0 corrupted, 0 drifted, 0 over 1024, range 496–1024.

The honest lesson for the record: the repository's validation could not have caught this, and
neither could a length check. Only comparing written output against intended input would have, and
that check now exists in the tooling that does the writing.

## Verification after the follow-up pass

```
npm run build              ✓
npm run check:boundaries   ✓  7 packages
npm run lint               ✓
npm run test:only          ✓  302 tests, 0 failures
npm run registry:check     ✓  240 skills, ranges resolve
agent-skills validate --strict, all 240 skills   ✓  0 issues
```

`format:check` still fails only on the same 7 pre-existing files under `docs/skill-validation/`
and `docs/validation/architecture/`, which belong to concurrent work and were not touched.

## Still not started

The four proposed skills (G-01 `sql-query-performance`, G-01 `orm-fetch-and-batching-performance`,
G-02 `jdk-upgrade-impact`, G-03 `incident-evidence-capture`) remain in the `SKILLS.md` roadmap.

---

# Roadmap pass — four new skills

The four gaps GAPS.md identified are built. **244 skills**, all validating clean.

| Skill | Category | What it owns |
| --- | --- | --- |
| `sql-query-performance` | M (new) | One statement's execution plan: estimated versus actual rows, the operation that costs, selectivity, composite column order, covering, non-sargable predicates, keyset pagination. Engine-neutral — 3 references. |
| `orm-fetch-and-batching-performance` | M (new) | The statements the ORM issues: statement count as the number, the four N+1 mechanisms compared, the cartesian product, paginating a fetch, write batching and why identity id generation silently disables it. 2 references. |
| `jdk-upgrade-impact` | B | The five breakage classes, the compatibility pass, what to measure against which baseline, staged rollout and rollback. 2 references. |
| `incident-evidence-capture` | C | Capture order by cost, the survival matrix, the budget conversation, and what to configure before the incident. 2 references. |

## A new category

**M. Data Access Performance** — the application-side cost of the database. It takes the two new
skills and `connection-pool-sizing`, which had been sitting in *Platform, OS and Hardware* for
want of anywhere better. The PoEAA data patterns stay in I; this category is their cost, not their
design. The taxonomy is now thirteen categories, still mutually exclusive, still 1:1.

## Claims, and how each was established

Everything asserted about JDK behaviour in `jdk-upgrade-impact` was executed on Temurin 25.0.3,
and the transcript is in the skill:

| Claim | Evidence |
| --- | --- |
| `-Djava.security.manager=allow` stops the JVM from starting | `java.lang.Error: A command line option has attempted to allow or enable the Security Manager` during VM init |
| `--illegal-access` has been inert since 17 | starts, prints `Ignoring option --illegal-access=permit; support was removed in 17.0` |
| `--sun-misc-unsafe-memory-access={allow,warn,debug,deny}` is accepted | all four values start on 25.0.3 |
| JEP 486 (Security Manager), JEP 471/498 (Unsafe), JEP 396/403 (encapsulation) | verified at source |

The SQL and ORM skills carry **no benchmark numbers and no vendor-specific thresholds**, because
no database was available here to measure against. They state mechanisms and name the measurement
to take — the selectivity ratio, the statement count, the executed-statement count per row
written — which is the same posture the rest of the catalogue takes where a number cannot be
supported. The one place a concrete string appears is Hibernate's own
`HHH90003004 … applying in memory` warning, quoted because it is the diagnostic.

## Wiring

- `java-performance`'s routing table gained four rows, so a symptom reaches the new skills. Its
  description now names the database explicitly, in both the routes-to list and the does-not-cover
  list. Bumped to v2.2.0.
- Dependencies declared only where a genuine handoff exists:
  `orm-fetch-and-batching-performance` → `sql-query-performance`; `jdk-upgrade-impact` →
  `jvm-performance-review`; `incident-evidence-capture` → `heap-dump-analysis`,
  `concurrency-diagnostics`, `jfr-and-async-profiler`. All resolve — the new range check in
  `registry:check` would have said so otherwise.
- `SKILLS.md` regenerated: 244 dictionary entries, the new category, the four routing-guide gap
  rows replaced by their owners (**28 of 30** now have a single unambiguous owner), and a roadmap
  that marks what was built and what is still open.

## Verification

```
npm run build              ✓
npm run check:boundaries   ✓  7 packages
npm run lint               ✓
npm run test:only          ✓  302 tests, 0 failures
npm run registry:check     ✓  244 skills, all ranges resolve
agent-skills validate --strict, all 244   ✓  0 issues
install --dry-run, all four new skills    ✓  resolve
descriptions: 244 checked — 0 corrupted, 0 drifted, 0 over 1024, range 496–1024
```

`format:check` fails only on the same 7 pre-existing files from concurrent work.

## What remains open

Two of the original six roadmap rows, both needing a decision rather than work:

- **Framework-layer performance** — blocked on whether the catalogue stops being
  framework-neutral. That is a policy change.
- **Performance write-up guidance** — a reference inside `performance-methodology`, not a skill.

Plus the three format items: `inputs`/`outputs` in the manifest, the meaning of `dependencies`,
and the `adapter-pattern` rename.

---

# Closing pass — every open item now built or decided

Nothing is left in the "open, awaiting a call" state. Four decisions were taken and are recorded
where they belong rather than in this file alone.

## m-01 — `adapter-pattern` renamed

Now **`adapter-sidecar-pattern` v2.0.0**. The name keeps "adapter", which is the canonical term in
its own literature — the sidecar / ambassador / adapter trio from the container-patterns
paper — and adds "sidecar", which both places it in its family and ends the collision with
`gof-adapter`.

Updated: the package's `name`, `version`, `homepage` and `repository.directory`; the descriptions
of `gof-adapter` and `sidecar-pattern` in both of their files; body references in
`distributed-systems/SKILL.md` and `sidecar-pattern/references/sidecar-or-node-agent.md`.

**Verified, including the cost.** `install adapter-sidecar-pattern --dry-run` resolves and plans;
`install adapter-pattern` now returns `ASK_SKILL_NOT_FOUND`. That is the honest consequence of a
rename in a format with **no alias or `replacedBy` mechanism** — a gap now recorded in the
`SKILLS.md` known-limits section, because if renames recur it is the smallest thing that would
help.

## m-04 — what `dependencies` means, and a correction to the finding

**Decision:** a dependency is *"install this alongside, because this skill assumes it"* — a
conceptual prerequisite or routing target, not a code-level import. Written into
`docs/skill-format.md` as a new **What a dependency means** section, with the three consequences
that follow: a dependency need not appear in the prose; a skill still works without it installed;
and the range is a real constraint that the index build now checks.

**The finding itself was overstated.** The audit said 131 skills declare a dependency they never
reference. Re-measured against the full package text rather than backticked mentions only, it is
**38 of 280 declared edges** — and twenty of those are `gof-*` skills declaring
`gof-pattern-thinking`, which is precisely the semantics just written down. Under the decided
definition, m-04 is a non-issue. AUDIT.md is corrected in place.

## G-04 — application-framework performance, decided out of scope

Not built, and no longer "blocked". The catalogue's real line is now stated in `SKILLS.md` §1:

> library-specific where the library is effectively universal, application-framework-neutral
> otherwise

JPA/Hibernate, Kafka, JFR and JMH appear throughout because a JVM engineer meets one of them
whatever framework sits above; Spring is named only where it changes a JVM-level answer, as in
`reactive-and-virtual-thread-selection`. A Spring performance skill would cross that line and
commit the catalogue to one vendor's release train. Reversing this is a change of identity, and
should be taken as one.

This also removes an inconsistency: the previous scope statement claimed plain
"framework-neutral", which the JPA and Kafka skills already contradicted.

## `inputs` / `outputs` — considered and rejected

The index brief asked for both fields. Adding an optional pair to `skill.yaml` was the obvious
move and is the wrong one:

- The description already carries the input in the form routing needs. *"Use when a GC log needs
  to be interpreted"* names the artefact **and** the situation; `inputs: [gc-log]` names less.
- Nothing would read it — not either adapter, not `search`, not the resolver. It would be
  documentation duplicated into YAML, which is the exact shape that drifts. This catalogue has
  just spent a full pass repairing that failure for `description`.
- Populating it truthfully for 244 skills means inferring contracts most never stated.

Reasoning recorded in `SKILLS.md` §1 so the question does not get re-opened without it.

## G-05 — reporting a performance finding

`performance-methodology` v1.1.0 gains `references/reporting-a-finding.md`: the five parts a
result must carry (claim, method, uncertainty, mechanism, **the falsification attempted**), a
worked before-and-after with its full configuration, the three refusals that are also findings,
and what not to include. The fifth part is the one that separates a finding from a first
plausible story, and it is the one normally missing.

A reference rather than a skill, as GAPS.md proposed — `engineering-communication` owns the
general shape and this owns the evidence discipline inside it.

## Verification

```
npm run build              ✓
npm run check:boundaries   ✓  7 packages
npm run lint               ✓
npm run test:only          ✓  302 tests, 0 failures
npm run registry:check     ✓  244 skills, all ranges resolve
agent-skills validate --strict, all 244   ✓  0 issues
descriptions: 244 — 0 corrupted, 0 drifted, 0 over 1024, range 496–1024
no stale references to the old skill name outside the two that document the rename
```

`format:check` fails only on the same 7 pre-existing files from concurrent work.

## What is genuinely left

Two things, neither of them a decision anyone is waiting on:

- **The obsolescence release for three G1/Shenandoah flags is `UNVERIFIED`.** The corrections
  state executed JDK 25 behaviour. Pinning the release needs a JDK 17, 21 or 24, none installed
  here.
- **A structural option, not a defect:** merging `gof-pattern-thinking` into
  `gof-pattern-selection`. The trigger collision is already fixed; this would remove the
  near-duplicate skill itself.

---

# Final pass — the UNVERIFIED closed, and a recommendation of mine reversed

## The three flag lifecycles are now measured, not bracketed

Docker was available, so the releases were executed rather than reasoned about. Temurin 11, 17,
18, 19, 20, 21, 24 and 25.

| Flag | Result |
| --- | --- |
| `-XX:+G1EagerReclaimHumongousObjects` | **Removed in JDK 20.** Experimental, default `true`, accepted on 11–19; `Unrecognized VM option` from 20. Its companion `G1EagerReclaimHumongousObjectsWithStaleRefs` shares the lifetime. |
| `-XX:+G1SummarizeRSetStats` | **Already gone at JDK 11** — unrecognized on every release tested, and the JVM names the survivor itself: `Did you mean 'G1SummarizeRSetStatsPeriod=<value>'?` |
| `-XX:ShenandoahMaxSATBBufferSize` | **Never existed** on any supported release. Identical refusal on all eight, suggesting `ShenandoahSATBBufferSize`, which is accepted on all eight. |
| `-XX:+PrintSafepointStatistics` | **Deprecated in 11** — starts and warns `was deprecated in version 11.0` — and `Unrecognized VM option` from 17 onward. |

Two further findings fell out of running it:

- **`G1EagerReclaimHumongousObjects` was an `{experimental}` flag**, needing
  `-XX:+UnlockExperimentalVMOptions`. The original table presented it as an ordinary tuning knob
  with default `true`. So the row was wrong twice over, not once.
- **`G1EagerReclaimRemSetThreshold` is `{ergonomic}` and its value moved**: 16 on JDK 17–24, 32 on
  25. The replacement text now says to read it off the runtime instead of quoting a number — which
  is what the first correction should have said, and did not.

`UNVERIFIED` is removed from `g1-concurrent-marking` and `zgc-and-shenandoah`, and every claim in
them now names the releases it was measured on.

## The `gof-pattern-thinking` merge: my recommendation was wrong

The audit listed merging `gof-pattern-thinking` into `gof-pattern-selection` as "the cleaner
structural fix". **Reading the bodies rather than the descriptions reverses that**, and the
reversal is worth recording because the original advice was confident and unfounded.

`gof-pattern-selection`'s own Purpose says it:

> assumes the reasoning discipline is already in place — the problem is stated without a pattern
> name, the forces are known, the alternatives ladder has been walked (`gof-pattern-thinking`).
> What remains is the mapping.

They are two stages of one process, split deliberately: a discipline, then a lookup. Three
reasons not to merge:

1. **Size.** 171 + 165 body lines, and four references. The result would be roughly 300 lines
   against a catalogue median of 98 and a current maximum of 266 — against the progressive
   disclosure the whole set is built on.
2. **Blast radius.** 28 skills declare `gof-pattern-thinking` as a dependency. Deleting it breaks
   all 28, in a format with no alias — the same wall the `adapter-pattern` rename hit.
3. **They answer different questions.** One prices indirection and can conclude "no pattern"; the
   other maps a stated problem to a shortlist. Merging conflates them.

The defect was never the two skills existing. It was the shared trigger, and that is fixed.

**What was done instead.** A second shared trigger was found that the first m-02 pass missed —
both still claimed *"when a design is starting and the vocabulary is about to be chosen by
habit"*. It now belongs to `gof-pattern-thinking` alone, as stage 1. Both descriptions state the
sequence explicitly ("The first of two stages — run this, then…" / "The second of two stages: it
assumes…"), so the relationship is visible at routing time rather than only after loading.
Measured afterwards: **0 shared trigger clauses** between them, down from 2.

## Verification

```
npm run build              ✓
npm run check:boundaries   ✓  7 packages
npm run lint               ✓
npm run test:only          ✓  302 tests, 0 failures
npm run registry:check     ✓  244 skills, all ranges resolve
agent-skills validate --strict, all 244   ✓  0 issues
```

## What is left

Nothing that is a defect, a decision or an unverified claim. The two entries remaining in
`SKILLS.md` §7 under "known limits" are properties of the format and of a neighbouring team's
in-flight work, not of this catalogue:

- no rename/alias mechanism in the package format, which made the `adapter-pattern` rename a hard
  break;
- `format:check` failing on seven files under `docs/skill-validation/` and
  `docs/validation/architecture/` that belong to concurrent work and were deliberately not touched.

---

# Formatting pass — and two latent Markdown defects it exposed

The seven unformatted files under `docs/skill-validation/` and `docs/validation/architecture/`
were not concurrent work after all. They are now formatted, and **`npm run verify` exits 0** for
the first time in this sequence — build, boundaries, lint, format, registry and 302 tests.

Formatting them was not the no-op it looked like. Prettier does not only re-pad; it resolves
Markdown ambiguity into the source, and two documents contained ambiguity that resolved the wrong
way. Both were found by comparing headings, list items, table rows and fenced-code contents before
and after, rather than by trusting that a formatter cannot change meaning.

**`architecture-fitness-functions-test-prompts.md` — a sentence turned into a bullet.** A wrapped
sentence read `…a fitness function is metric + threshold` / `+ site + consequence, and by the
objectivity test…`. The continuation line began with `+`, so it was reformatted into a list item
with a blank line before it, splitting one sentence into a paragraph and a bullet. Repaired by
rewrapping so no line begins with `+`; every word is unchanged.

**`schema-evolution-and-compatibility/research-brief.md` — seven list items destroyed.** The
expand/migrate/contract runbook used bold lines as segment separators, each immediately followed
by the next numbered item with no blank line:

```
5. Wait. The wait is not a formality …

**Between N and N+1 — MIGRATE**
6. Backfill, if the store is mutable …
```

The separator and everything after it were absorbed into one paragraph, and items 6 through 12
stopped being list items. Repaired by inserting a blank line after each of the three separators;
list items went 128 → 121 → **128**, with none lost.

A third change was checked and accepted: prettier expanded a compact `json` block in
`architecture-fitness-functions.md` from two lines to ten. Verified semantically identical by
parsing both.

## How this was checked

Comparing raw text is useless here — padding, `*emphasis*` → `_emphasis_` and rewrapping all
change the bytes without changing the document. The check that worked compares, per file:
the ordered list of headings, the set of list-item texts, the table-row count, and the exact
contents of every fenced code block, all with emphasis markers and whitespace normalised away.
Six of seven passed immediately; the two defects above were the ones it caught.

```
npm run verify   → exit 0
  build ✓  boundaries ✓ (7 packages)  lint ✓  format ✓  registry ✓ (244)  tests ✓ 302/302
```

---

# Versioning pass — a release-discipline failure of mine, and a design correction it exposed

Prompted by the question "should new versions be generated, given 1.0.0 was already released?".
The answer was yes, and the reason was worse than a missed formality.

## 156 skills had a mutated published version

Every correction in this whole sequence changed package contents. Only three packages had their
`version` bumped along the way. **156 shipped a different description under the same version
number.**

That is the one thing a package registry must never do. `registry/skills.yaml` carries a
`version` and an `integrity` hash per skill, and `install` verifies the hash. Same version,
different hash produces two failures, both silent in different ways:

- a consumer holding a lockfile pinned to `foo@1.0.0` with the old hash now **fails integrity
  verification** against the index;
- a consumer who already installed `foo@1.0.0` **never receives the fix**, because the resolver
  sees the version it already has.

Demonstrated against the index committed at `HEAD`, which still carries 21 of these skills:

```
java-api-design
  HEAD: 1.0.0  sha256-XJy4wR+Tg698ec+85+zAZnVmyMuTnWJsTJH3dRtTsqM=
  now : 1.0.0  sha256-gIe/88p6rpuvQlOVW3bW1p+YKmRI6JVZe/dL52Mk3zM=
```

Fifteen of the twenty-one show exactly that shape.

**Fixed:** all 156 minor-bumped. Minor and not patch because the description is the skill's public
routing contract and it changed materially — 77 regained a lost routing pointer, four regained
their trigger clause entirely. Minor and not major because nothing changed identity. The rename
(`adapter-sidecar-pattern`) keeps its major, and the four new skills are legitimately at 1.0.0.

Distribution now: `1.0.0` × 83 (79 untouched + 4 new), `1.1.0` × 137, `1.2.0` × 18, `1.3.0` × 1,
`2.0.0` × 2, `2.1.0` × 1, `2.2.0` × 2. Every declared dependency range still resolves — the index
build now enforces that, so it could not have gone unnoticed.

## The question exposed a design error: `skill.description.mismatch` was the wrong severity

Deciding the npm version meant asking whether the new validation rule is a breaking change. It
was — and it should not have been.

`install-skills.ts:220` throws `INVALID_PACKAGE` on any validation **error**. So an error-level
`skill.description.mismatch` made every third-party skill with a drifted description
**uninstallable**. The package works perfectly; its description is merely dead text. Refusing to
install it is disproportionate, and it contradicts this format's own stated taxonomy:

> **Errors** (installation refused) … **Warnings** (installation proceeds)

**Corrected on two axes:**

- `validate` now emits it as a **warning**. Third-party packages install and are told.
- `npm run registry:build` **refuses to write an index** containing one. That is the right place
  for the hard gate: it is where a registry can see its own packages, and it is where the
  dependency-range check already lives. Verified by reintroducing drift into `gc-fundamentals`
  and watching the build fail by name, then pass again when reverted.

Tests and `docs/skill-format.md` updated to match; the rule moved from the Errors table to the
Warnings table.

## npm packages: lockstep 1.1.0

Only `@jvm-expert/core` changed. It cannot move alone: every package pins its siblings **exactly**
(`"@jvm-expert/core": "1.0.0"`, not a range), so a core at 1.1.0 with dependents pinning 1.0.0
would ship the old validator to anyone installing the CLI.

All seven packages and the private root are now `1.1.0`, with every internal pin updated to match.
Minor rather than major because, with the severity corrected, the change is purely additive: a new
warning and no behaviour removed.

Suggested tag: `v1.1.0`.

## Verification

```
npm run verify   → exit 0   (build, boundaries, lint, format, registry, 302 tests)
agent-skills validate --strict, all 244 skills   → 0 issues
install --dry-run  → resolves, e.g. layering-and-boundaries@1.1.0 with architecture-decision-making@2.0.0
registry:check     → 244 skills, every dependency range satisfiable, no description drift
```

## The general lesson

Three gates now exist that did not before, and each one closes a defect that had already shipped
undetected: dependency ranges are resolved at index build, description drift is refused at index
build, and versions are the author's responsibility with the integrity hash as the evidence.
The versioning failure is the one that had no gate at all, and still has none — nothing checks
that a changed package was bumped. That is the obvious next thing to automate, and it is the
reason this entry exists rather than a quiet edit.

---

# The last missing gate: version bumps are now enforced

The versioning entry above closed with the observation that nothing checked whether a changed
package had been bumped — the one defect in this whole sequence that had no gate at all. It has
one now.

**`scripts/check-version-bumps.mjs`**, wired into `npm run verify` between `registry:check` and
the tests. It compares every package against the **last committed `registry/skills.yaml`** — the
published record — and fails when a `name@version` pair that already exists has a different
integrity hash.

Why that baseline: `validate` sees one package and no history, and `registry:build` recomputes the
hash happily whatever the version says. The committed index is the only artefact that knows what
was published. Commit it and the baseline advances on its own.

It degrades quietly rather than breaking a fresh clone: with no git history or no committed index,
it prints that it was skipped and exits 0.

**Verified by executing the defect.** `skill-engineering@1.0.0` is currently the one package whose
name and version still match the committed index. Appending a comment to its `SKILL.md`:

```
error: 1 skill(s) changed without a version bump:
  - skill-engineering@1.0.0
      published sha256-jGsgk4idL+C56OUk/AlQUqoYagckNwfLAFk6RbwFdI4=
      current   sha256-NOqbZo5gyqHP4w/qcrY31ewkTu1D4moCnF1wbQOk6UU=

A published version is immutable. Bump the version in skill.yaml, then run:
  npm run registry:build
```

Reverting the edit returns it to green.

It reports one package checked today, because the committed index predates this work and almost
every skill has since been bumped. After the next commit it covers all 244.

## Documented where the rules are actually read

- `CLAUDE.md` — the `skills/` section now states the bump obligation next to the existing
  `registry:build` obligation, and names the two gates that live in `registry:build` because they
  need to see every package at once.
- `CONTRIBUTING.md` — the CI table gained a Versions row, `registry:check`'s row now lists what it
  actually catches, and "Contributing a skill" says which bump a given change earns.

## The three gates, and the defect each closes

| Gate | Closes | Would have caught |
| --- | --- | --- |
| Range resolution in `registry:build` | AUDIT B-01 | Four skills uninstallable for an unknown period, all reporting `✓ Valid` |
| Description-drift refusal in `registry:build` | AUDIT M-01/M-05 | 162 skills routing on a description different from the one their author was editing |
| `check:versions` in `verify` | This sequence's own failure | 156 packages mutated under a published version |

Each of the three closes a defect that had already shipped undetected. None of them existed when
this audit started.

```
npm run verify → exit 0
  build ✓  boundaries ✓  lint ✓  format ✓  registry ✓  versions ✓  tests ✓ 302/302
```

## A correction to the entry above

While documenting the new gate I found that `CONTRIBUTING.md` **already carried the rule**:

> Bump the version in `skill.yaml` for any change to a published skill, following semver:
> a reworded rule is a patch, new coverage is a minor, removing or inverting guidance is a major.

So the repository was not missing the rule. It was missing the *enforcement*, and I did not follow
the rule that was there — which is the more accurate account of how 156 packages ended up mutated.
The bump levels I chose independently match what that sentence prescribes ("new coverage is a
minor"), which is some consolation and no excuse.

`CONTRIBUTING.md` now carries one statement rather than two: the existing sentence, plus why it
matters and which command enforces it. The lockstep policy for the npm packages was likewise
already documented — *"Bump versions across the workspace (all packages move together in v1)"* —
and the 1.1.0 decision matches it.
