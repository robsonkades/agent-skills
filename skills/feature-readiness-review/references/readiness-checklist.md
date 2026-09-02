# Readiness checklist

Each item is PASS, N/A with a reason, or OPEN. Items marked **blocking** stop implementation
entirely; the rest block only the resources that depend on them.

## Understanding

| #   | Item                                                                | Blocking |
| --- | ------------------------------------------------------------------- | -------- |
| 1   | The requirement is stated in the domain's terms, not as a solution  | yes      |
| 2   | Every assumption still standing is written down with its falsifier  | yes      |
| 3   | Every HIGH-impact unknown is either resolved or explicitly accepted | yes      |
| 4   | No question marked BLOCKING is open                                 | yes      |
| 5   | Ambiguities were resolved by the user, not by the agent choosing    | yes      |

## Scope

| #   | Item                                                                     | Blocking |
| --- | ------------------------------------------------------------------------ | -------- |
| 6   | In scope is listed, and every item traces to a requirement or constraint | yes      |
| 7   | Out of scope is listed, each with a reason and who excluded it           | yes      |
| 8   | The creep check has been run over Required and Recommended               | no       |

## Constraints and decisions

| #   | Item                                                                | Blocking |
| --- | ------------------------------------------------------------------- | -------- |
| 9   | Mandatory, preferred and prohibited technologies are established    | yes      |
| 10  | Organisational standards are established, or confirmed not to exist | yes      |
| 11  | Every decision carries a provenance and an authority                | yes      |
| 12  | Every user-confirmed decision has actually been confirmed           | yes      |
| 13  | Decisions that materially affect the system have records            | no       |
| 14  | No decision rests on "the project already does this" alone          | yes      |

## Context and architecture

| #   | Item                                                             | Blocking |
| --- | ---------------------------------------------------------------- | -------- |
| 15  | The context report exists and every finding cites evidence       | no       |
| 16  | Established project patterns are identified and will be followed | no       |
| 17  | The impact map lists paths, not descriptions                     | yes      |
| 18  | Every boundary crossing is named, with who depends on it         | yes      |
| 19  | Reusable components were looked for and the result recorded      | no       |

## The change itself

| #   | Item                                                               | Blocking |
| --- | ------------------------------------------------------------------ | -------- |
| 20  | The API or message contract is defined, including failures         | yes      |
| 21  | Schema changes are defined, with the compatibility window          | yes      |
| 22  | Error and failure behaviour is defined for the named cases         | yes      |
| 23  | Security obligations are established — authn, authz, data handling | yes      |
| 24  | Configuration is defined, with defaults and per-environment values | no       |
| 25  | Observability is defined: what an operator sees when it misbehaves | no       |

## Execution readiness

| #   | Item                                                                   | Blocking |
| --- | ---------------------------------------------------------------------- | -------- |
| 26  | Resources exist, each with dependencies and a validation               | yes      |
| 27  | The execution order is derived, with forced arrows marked              | yes      |
| 28  | The test strategy is set per resource, not as a paragraph              | yes      |
| 29  | Migration, deployment and rollback are written as sequences            | yes      |
| 30  | Risks are identified; every HIGH one has a mitigation or an acceptance | yes      |
| 31  | Acceptance criteria are observable and each names its verification     | yes      |
| 32  | Dependencies on other people or systems are named                      | no       |

## Scaling the checklist

Not every feature runs all thirty-two. By depth class:

- **Direct** — no gate. The change is reversible and local; running a checklist over it is the
  ceremony the depth classification exists to avoid.
- **Standard** — items 1–14, 17, 20–23, 26–28, 31. Skip what the feature cannot touch.
- **Significant** — all of them.

Items are skipped by **class**, never by convenience. An item skipped because answering it is
awkward is the one that will matter.

## Reporting the gate

```text
Readiness: NOT CLEAR — 2 open, both blocking

OPEN  #4  Q-08 is unanswered: is a repeated dispatch a duplicate or a second
          dispatch? Blocks R-07 and R-08.
OPEN  #21 The compatibility window is undefined: whether the currently deployed
          reader tolerates the new column value is unverified.

N/A   #29 (migration) — none of the resources touches persisted data.
          Wrong: R-03 adds a column. Corrected to OPEN.

Clear to start: R-09, R-10 (no dependency on either open item).
```

The corrected line is worth imitating. An N/A that turns out to be wrong is the most common way
a checklist passes while the feature is not ready.
