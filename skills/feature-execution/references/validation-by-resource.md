# Validation by resource

## The principle

Validation is proportional to what the resource can break, not uniform. Running the whole suite
for a log-message change trains people to skip validation; running only a compile for a
migration is how existing rows are lost.
Apply repository-required checks even for small changes; risk-based selection chooses additional
evidence or follows an existing scoped-check policy, not an unapproved exemption.

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

The negative case is the one most often missing. An allowed-path security test can establish
permitted access; it does not establish that forbidden access is denied.

## Beyond the resource

Some checks cover more than one resource. Follow the project's required selection and cadence;
the following are starting points when the project does not prescribe a different schedule:

- **The module's test suite** — after the last resource of a story or a coherent group.
- **The project's applicable build and gate set** — before declaring the feature complete.
  Use its actual stack and accepted check-selection rules; documentation-only work need not
  acquire a Java build, while a required full build cannot be replaced by focused tests alone.
- **Contract or consumer tests** — when the changed boundary needs them; group related
  resources if a meaningful end-to-end check requires the complete path.
- **A migration at representative scale** — early enough to change the plan before the
  project's merge/release gate. Use isolated synthetic or sanitized data and measure locks,
  runtime, space and reader/writer compatibility when those risks matter.

## Reading the output

Failures that look like success:

- **A suite that selected nothing.** It may exit zero. Check executed and skipped test counts.
- **A test that misses the changed behavior.** Inspect assertions and the path exercised.
  A first-run pass can be valid for already-correct behavior; when a regression should be
  exposed, verify against the known failing case or a bounded controlled mutation if useful.
- **A green build with a skipped module.** Check what ran, not just the final line.
- **The right test against the wrong artifact.** Inspect which compiled classes, workspace
  dependency, generated schema or deployed revision the runner actually loads. Run required
  build/generation steps before the test when those inputs are stale. Reuse incremental builds
  or cached evidence when their input tracking establishes applicability; neither rebuilding
  everything nor trusting a passing count by itself establishes this.

An invocation's name does not establish its prerequisites. For example, Maven lifecycle phases
run preceding phases, while a directly invoked plugin goal does not generally do so; Surefire
executes generated test classes. Inspect the project's invocation and resolved classpath rather
than assuming that a test command compiled current sources and dependencies.

Inspect the resulting diff when generators, fixers or hooks can modify tested inputs. For example,
`npm test` can run a `posttest` script after its test script. If a later step changes a relevant
contract or implementation, the earlier result covers the earlier state. Check the impact and
rerun the affected validation, preserving other contributors' edits; do not blindly discard
generated changes or invalidate unrelated evidence.

Record command, counts and the inputs/target actually checked. "4 tests, 4 passed" identifies a
result, but supports this resource only when its exercised behavior and revision are relevant.

## When the planned validation is impossible

It happens: the test infrastructure does not exist, the dependency cannot be reached, the
engine is not available locally. Then, in this order:

1. **Say so** — this is the finding, and it does not go unmentioned.
2. **Run a useful bounded alternative when available**, and name the property it establishes
   and what it does not cover. A narrower real interaction can answer a narrow contract question;
   an unrelated passing test is not a reason to spend more effort or claim equivalence.
3. **Keep it IN_PROGRESS or BLOCKED when required evidence is missing**, using BLOCKED only
   for an external impediment. Record DONE only when the required acceptance is established
   by the planned check or a justified equivalent. Changing acceptance needs the applicable
   scope/authority decision, not simply a note saying the check was unavailable.

```text
RES-06 Dispatch repository query          BLOCKED
      Planned     integration test against PostgreSQL
      Ran         unit test over the specification; the project has no database test
                  harness and adding one is out of scope (SC-03)
      Not covered whether the generated SQL is valid against the real engine
      Follow-up   Q-09 — resolve the target-engine validation environment
      Completion  pending target-engine evidence; unit checks are partial evidence only
```

This accurately separates implemented code from verified SQL. An unavailable environment
does not authorize claiming the query works or weakening its required validation.

## Sources for command behavior

- [Maven build lifecycle](https://maven.apache.org/guides/introduction/introduction-to-the-lifecycle.html): phases versus directly invoked goals; project bindings determine the actual work.
- [Surefire test goal](https://maven.apache.org/surefire/maven-surefire-plugin/test-mojo.html): generated test classes and configured test classpath.
- [npm lifecycle scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/): `pretest`, `test` and `posttest` order. Inspect the project's scripts and npm version before applying it.
