# Validation report — `java-domain-modeling`

|               |                                                          |
| ------------- | -------------------------------------------------------- |
| **Iteration** | 1 (only)                                                 |
| **Result**    | **FAIL** — 2 BLOCKER, 6 MAJOR, 6 MINOR, 5 NIT            |
| **Date**      | 2026-08-28                                               |
| **Validator** | Independent agent; not the author                        |
| **Baseline**  | Temurin 25.0.3, `javac --release 21`                     |
| **Outcome**   | Skill withdrawn, not re-drafted. See `release-record.md` |

## The two blockers

Both are scope contradictions with material that entered the working tree **after** the research
brief was written (2026-08-27), and both were independently reproduced by the author before
acting.

**B1 — the classification is already owned.**
`skills/domain-logic-organization/references/domain-model.md` (untracked, i.e. shipping in the
same batch) carries a section titled `## Classifying a concept: entity, value, or neither` with
Evans' two questions, the replaceability test, the conceptual-whole example (_"an amount without
its currency"_), the sentence _"the burden of proof sits on the entity"_, and the third answer
("neither"). It routes the wrapper question to `java-code-smells`, never to `java-domain-modeling`
— so the two packages assigned the same decision to different owners.

**B2 — the wrapper budget is already owned, with a different rule.**
`skills/java-code-smells/references/catalogue-within.md` (modified in the same batch) states the
budget as **two** tests — _confusion_ or _rule_. The draft stated **three** — rule, behaviour,
confusion. A wrapper with a behaviour but no rule and no confusion risk qualified under one skill
and was a deletion candidate under the other. `catalogue-within.md`'s Lazy Element entry
(_"the difference is whether the wrapper carries a rule"_) contradicted the draft's own worked
example, which argued `CustomerId` qualifies on confusion risk with no rule at all.

The research brief's §7 had permitted the skill to own exactly three things: the classification,
the wrapper budget, and the concept-to-construct table. Two of the three were gone.

## Substantive defects found independently of scope

These were real and would have shipped. They are the reason the gate exists.

| Sev   | Finding                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MAJOR | The concept-to-construct table claimed a `record` keyed on its id has **identity equality**. False: the generated `equals` compares every component. It is identity equality only when the id is the record's _sole_ component. The brief said "only component"; the draft dropped it. Measured: `AccountSnapshot("ACC-1",100,"ana").equals(AccountSnapshot("ACC-1",250,"ana")) → false`, `HashSet.contains → false`. |
| MAJOR | The budget table gave `FirstName` vs `LastName` as an example of a pair that is _"never transposable at a call site"_. `new Person(last, first)` is the textbook transposition, so the table produced the opposite of its own rule on its own example.                                                                                                                                                                |
| MAJOR | `skill.yaml` description was 1104 characters against the Claude adapter's ~1024 warning threshold (`claude.description.long`). The truncated tail was precisely the two hand-offs to the skills it overlapped most.                                                                                                                                                                                                   |
| MAJOR | Frontmatter and manifest descriptions differed in **claims**: the frontmatter advertised the trigger "when a model is called anemic", which the body then routed away twice.                                                                                                                                                                                                                                          |
| MAJOR | No neighbouring skill named the exclusion in return — `grep -rl "java-domain-modeling" --include=SKILL.md skills/` returned nothing outside the skill itself, against `skill-engineering`'s explicit "narrow **both** and state the exclusion in **each**".                                                                                                                                                           |
| MAJOR | ~55 of 172 body lines duplicated neighbours: five of seven Rules restated `java-object-contracts`, `orm-structural-mapping`, `remote-facade-and-dto`, `java-enums` and `domain-logic-organization`.                                                                                                                                                                                                                   |
| MINOR | The body's "Before and after" fragment did not compile to the error it quoted — the After block never redeclared `Order`, so the real error was `String cannot be converted to AccountId`. The `scripts/` version was correct; the prose fragment was not.                                                                                                                                                            |
| MINOR | Evans' ENTITIES quotation dropped a paragraph with no ellipsis at the join.                                                                                                                                                                                                                                                                                                                                           |

## What passed

- **Technical accuracy** — every version claim verified by compilation: records final in 16,
  sealed in 17, pattern matching for `switch` and record patterns in 21, unnamed patterns in 22.
  `--release 21` rejects `case Pending _ ->`. A `switch` with no `case null` throws NPE.
- **API reality** — every type, method and annotation named exists with the stated semantics.
- **Compilability** — `scripts/verify.sh` ran green end to end and asserted the right thing.
- **Principle fidelity** — Evans' VALUE OBJECTS quotation character-identical to the brief after
  normalisation; Vernon explicitly marked paraphrase; the brief's `UNVERIFIED:` markers carried
  over rather than silently upgraded; Fowler and Bloch used in the sense they intended.
- **Dogma check** — three honest over-application counter-examples, none a strawman.

## Trigger quality

The description discriminated correctly against `java-immutability`, `java-object-contracts` and
the sealed-switch skills. Two defects: it over-captured the amount-plus-currency case (Data
Clumps, already owned), and it would have **missed its own most original section** — no "Use
when" clause named a construct-choice situation, so "enum or a sealed interface over records?"
would have selected `java-enums`.
