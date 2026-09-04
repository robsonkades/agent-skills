# Validation by resource

## The principle

Validation is proportional to what the resource can break, not uniform. Running the whole suite
for a log-message change trains people to skip validation; running only a compile for a
migration is how existing rows are lost.

The validation was written when the resource was defined. This reference is for choosing it
then, and for the case where the planned validation turns out to be impossible.

## Minimum by resource kind

| Resource                   | Minimum that establishes it works                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| Domain component           | Unit tests over the invariants, including the ones that must be rejected                    |
| Application service        | Unit tests over behaviour and the named failure paths                                       |
| API endpoint               | Request-level test: success, each named failure, and the authorisation rule                 |
| Request or response type   | Serialisation both ways, and each validation rule that rejects                              |
| Repository or query        | Executed against the real engine — a substitute engine validates nothing about the real one |
| Migration                  | Applied to a copy of the current schema, with existing rows read back                       |
| Message producer           | The payload, and that it is emitted at the right point in the flow                          |
| Message consumer           | Handling, idempotency, and the poison-message path                                          |
| Outbound client            | Timeout, retry behaviour, and how a failure is translated for the caller                    |
| Configuration              | The application starts with the value absent; defaults resolve                              |
| Security component         | Denies what it must, for each role, including the negative case                             |
| Metric or log              | Emitted, with the field names the plan specified                                            |
| Documentation              | Matches what shipped                                                                        |
| Refactor within a resource | The existing tests still pass, unchanged                                                    |

The negative case is the one most often missing. A security rule tested only on the allowed path
establishes nothing about the rule.

## Beyond the resource

Some checks belong to the feature, not to a resource. Run them at the points named, not after
every resource:

- **The module's test suite** — after the last resource of a story or a coherent group.
- **The full build and the project's gate set** — before declaring the feature complete.
- **Contract or consumer tests** — after any resource marked EXTERNAL in the impact map.
- **A migration against a production-shaped copy** — before release, not at merge, if the sizes
  differ enough to matter.

## Reading the output

Three failures that look like success:

- **A suite that selected nothing.** Exits zero. Check the count of tests run, every time.
- **A test that passes because it asserts nothing.** If it passed the first time you ran it,
  before the implementation existed, it does not test the implementation.
- **A green build with a skipped module.** Check what ran, not just the final line.

Record the command and the counts. "4 tests, 4 passed" is a claim someone can check; "tests
pass" is not.

## When the planned validation is impossible

It happens: the test infrastructure does not exist, the dependency cannot be reached, the
engine is not available locally. Then, in this order:

1. **Say so** — this is the finding, and it does not go unmentioned.
2. **Choose the strongest available substitute**, and name what it does not cover.
3. **Record the resource as DONE with a qualified validation**, or as IN_PROGRESS if the gap is
   material. The gap is stated in the completion report either way.

```text
RES-06 Dispatch repository query          DONE (qualified)
      Planned     integration test against PostgreSQL
      Ran         unit test over the specification; the project has no database test
                  harness and adding one is out of scope (X-03)
      Not covered whether the generated SQL is valid against the real engine
      Follow-up   N-02 — database test harness
```

That is an honest DONE. Silently substituting a weaker check and reporting the planned one is
not.
