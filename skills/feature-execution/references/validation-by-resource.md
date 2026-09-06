# Validation by resource

## The principle

Validation is proportional to what the resource can break, not uniform. Running the whole suite
for a log-message change trains people to skip validation; running only a compile for a
migration is how existing rows are lost.

The validation was written when the resource was defined. This reference is for choosing it
then, and for the case where the planned validation turns out to be impossible.

## Starting points by resource kind

| Resource                   | Evidence to select for the changed behavior                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Domain component           | Unit tests over the invariants, including the ones that must be rejected                                          |
| Application service        | Unit tests over behaviour and the named failure paths                                                             |
| API endpoint               | Request-level test: success, each named failure, and the authorisation rule                                       |
| Request or response type   | Supported wire directions, defaults/missing fields and relevant old/new compatibility; validation where applied   |
| Repository or query        | Target engine/version for SQL, isolation and plan claims; substitutes cover only their tested behavior            |
| Migration                  | Representative existing schema/data, constraints and reader/writer compatibility; failure and rollback limits     |
| Message producer           | Payload and durable publication boundary; relevant commit/ack failure and duplicate cases                         |
| Message consumer           | Handling, idempotency, and the poison-message path                                                                |
| Outbound client            | Timeout, retry behaviour, and how a failure is translated for the caller                                          |
| Configuration              | Optional defaults resolve; required or invalid values fail appropriately without exposing secrets                 |
| Security component         | Denies what it must, for each role, including the negative case                                                   |
| Metric or log              | Correct emission/fields, bounded cardinality and sensitive-data handling where affected                           |
| Documentation              | Matches what shipped                                                                                              |
| Refactor within a resource | Preserve behavior/contract assertions; move or adapt tests coupled to removed structure without reducing coverage |

The negative case is the one most often missing. A security rule tested only on the allowed path
establishes nothing about the rule.

## Beyond the resource

Some checks belong to the feature, not to a resource. Run them at the points named, not after
every resource:

- **The module's test suite** — after the last resource of a story or a coherent group.
- **The full build and the project's gate set** — before declaring the feature complete.
- **Contract or consumer tests** — when the changed boundary needs them; group related
  resources if a meaningful end-to-end check requires the complete path.
- **A migration at representative scale** — early enough to change the plan before the
  project's merge/release gate. Use isolated synthetic or sanitized data and measure locks,
  runtime, space and reader/writer compatibility when those risks matter.

## Reading the output

Three failures that look like success:

- **A suite that selected nothing.** It may exit zero. Check executed and skipped test counts.
- **A test that misses the changed behavior.** Inspect assertions and the path exercised.
  A first-run pass can be valid for already-correct behavior; when a regression should be
  exposed, verify against the known failing case or a bounded controlled mutation if useful.
- **A green build with a skipped module.** Check what ran, not just the final line.

Record the command and the counts. "4 tests, 4 passed" is a claim someone can check; "tests
pass" is not.

## When the planned validation is impossible

It happens: the test infrastructure does not exist, the dependency cannot be reached, the
engine is not available locally. Then, in this order:

1. **Say so** — this is the finding, and it does not go unmentioned.
2. **Choose the strongest available substitute**, and name what it does not cover.
3. **Keep it IN_PROGRESS or BLOCKED when required evidence is missing**, using BLOCKED only
   for an external impediment. Record DONE only when the required acceptance is established
   by the planned check or a justified equivalent. Changing acceptance needs the applicable
   scope/authority decision, not simply a note saying the check was unavailable.

```text
RES-06 Dispatch repository query          BLOCKED
      Planned     integration test against PostgreSQL
      Ran         unit test over the specification; the project has no database test
                  harness and adding one is out of scope (X-03)
      Not covered whether the generated SQL is valid against the real engine
      Follow-up   N-02 — database test harness
      Completion  pending target-engine evidence; unit checks are partial evidence only
```

This accurately separates implemented code from verified SQL. An unavailable environment
does not authorize claiming the query works or weakening its required validation.
