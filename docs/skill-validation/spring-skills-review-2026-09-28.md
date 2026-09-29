# Spring skill review — 2026-09-28

Implemented improvements to `spring-boot`, `spring-boot-web`, and
`spring-boot-jpa`, each from **1.0.0 to 1.1.0**. The baseline is commit
`44be334cfc0b265bbc994ed29c21f2ad82c47238`. This record covers the authorized follow-up
to the Spring review; the September 27 record remains historical.

## Changes and their purpose

| Skill                                                    | Implemented change                                                                                                                                                                                                            | Verified behavior                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [spring-boot](../../skills/spring-boot/SKILL.md)         | Register and validate default-client properties only when that client is selected; distinguish shared property validation. Add scheduler guidance and executable scheduler contracts.                                         | A custom client starts despite invalid unused default-client settings. Default-client validation remains active. Tests exercise Boot's virtual-thread scheduler and an explicit pooled scheduler, including fixed-delay interference and cleanup.      |
| [spring-boot-web](../../skills/spring-boot-web/SKILL.md) | Bound small synchronous JSON bodies before conversion, independently of parser and DTO limits; resolve public validation paths using the configured Jackson metadata and parameter aliases; add test-only security contracts. | Declared and chunked bodies enforce an 8192-byte limit, including multibyte input. HTTP errors expose supported public names. Real JWT decoding rejects hostile tokens; 401/403 responses, side-effect prevention, and OpenAPI groups are exercised.   |
| [spring-boot-jpa](../../skills/spring-boot-jpa/SKILL.md) | Require the caller's version for the note command and compare it before managed mutation without assigning `@Version`. Add database integration profiles and guidance on child-only changes and nullable uniqueness.          | Independently committed updates cause stale commands to fail while preserving the winner's state. Current-version changes and null clearing succeed. PostgreSQL and SQL Server integration sources compile; database runtime behavior remains pending. |

The framework and Java baseline were preserved. Additional security dependencies
are test-scoped, and container/database dependencies belong to the opt-in
`database-it` profile. The final web jar was inspected for accidental inclusion
of security test dependencies and probes.

## Executed validation

| Fixture                                 | Passing tests | Failures / errors / skips |
| --------------------------------------- | ------------: | ------------------------- |
| Boot composition and scheduling         |            16 | 0 / 0 / 0                 |
| MVC contracts, boundaries, and security |            20 | 0 / 0 / 0                 |
| JPA/H2 and mapping metadata             |            13 | 0 / 0 / 0                 |
| **Total Java fixture tests**            |        **49** | **0 / 0 / 0**             |

Validation used Temurin 25.0.3 and Maven 3.9.15 with the declared Spring Boot
4.1.1 baseline, in temporary copies. All 34 pre-existing fixture tests were
retained. Test counts describe executable test methods; several methods
exercise multiple input variants.

The coordinator checked 61 source files against the tested/frozen revisions,
resolved 33 local Markdown links, and ran strict CLI validation for all three
skills with isolated agent configuration. No broken links or validation issues
were found.

After the reviewers stopped writing:

- `npm run registry:build` passed for 283 skills. Exactly three entries changed;
  the other 280 were unchanged.
- `npm run verify` passed: build, architecture boundaries, lint, formatting,
  registry/version checks, and **355 tests in 67 suites**, with no failures or
  skips.
- `git diff --check` passed. This evidence record was added afterward and
  receives its own scoped formatting check.

## Database runtime limitation

The opt-in PostgreSQL and SQL Server test paths compiled. The PostgreSQL run
failed during setup with `Could not find a valid Docker environment`: one setup
error and **zero database contracts executed**. This was not recorded as a
passing or skipped integration test. SQL Server was not started, and its license
was not accepted.

Starting the existing Rancher runtime did not provide a usable daemon:
Docker operations timed out on a Hyper-V socket, and the backend reported
`vmState: DISABLED`. The temporary startup preference was restored and Rancher
was shut down.

Consequently, the new type round-trip, sequence, and lock contracts have no
real-engine execution evidence from this session. H2 and metadata tests do not
establish PostgreSQL or SQL Server behavior. Reproduction prerequisites and
commands are in the
[JPA fixture README](../../skills/spring-boot-jpa/assets/persistence-fixture/README.md).
The SQL Server path requires the operator's explicit license opt-in.

## Behavioral evaluation

Six fresh agents implemented three predeclared tasks, once using the committed
skill and once using its revised snapshot. Each pair started from the same
committed Java fixture and received the same task. Model and reasoning settings
were inherited without overrides. Separate workspaces and procedural access
rules were used; filesystem isolation was not enforced.

| Task                                | Original: passing tests | Revised: passing tests | Coordinator assessment       |
| ----------------------------------- | ----------------------: | ---------------------: | ---------------------------- |
| Custom-client property validation   |                      16 |                     15 | Both meet the named criteria |
| Caller-version note update          |                      13 |                     14 | Both meet the named criteria |
| Public JSON/header validation paths |                      18 |                     18 | Both meet the named criteria |

The coordinator inspected generated sources and test reports. The revised web
actor also demonstrated all six added regressions failing before its fix and
passing afterward. Its temporary probe DTOs emitted Hibernate Validator
container-level `@Valid` deprecation warnings; the run passed with that warning,
rather than establishing warning-free generated code.

**These results do not demonstrate a comparative quality gain.** Different
test counts reflect how the actors grouped assertions. These are known-rule
implementation tasks, with one execution per condition; there was no no-skill
control, blind holdout, or repeated-run estimate. The full tasks, predeclared
criteria, individual results, limitations, and source hashes are retained in
the [machine-readable record](spring-skills-review-2026-09-28.json).

A separate agent considered six prompts against 283 frozen catalog
descriptions. The Boot, MVC, JWT-security, and reactive cases selected the
expected specialist. The stale-client case selected
`offline-concurrency-control` first and `spring-boot-jpa` as collaborator:
a defensible route, but not the originally expected primary selection.
The Boot 3 migration case correctly declined silent use of Boot 4 guidance,
without suggesting `java-build-and-dependencies` as a possible collaborator.
This was a description-only routing probe, not actual client autoactivation.

## Evidence and boundaries

Detailed logs and actor workspaces remain under the local temporary roots
recorded in the JSON. They are session evidence, not archived repository
attachments. Repository source hashes make the reviewed revision identifiable.

The JSON body guard is a bounded synchronous MVC example; it does not establish
container-wide, streaming-upload, or compressed-body protection. Public-path
mapping uses safe fallbacks for unknown paths and does not claim universal
coverage of custom deserializers or every polymorphic mapping. No native-image,
production-load, or deployment validation was performed.

Existing user changes were preserved, including
`docs/agent-harness-optimization-plan.md` and the three pre-existing fixture
`target/` directories. No commit, publication, global installation, or real
agent configuration change was performed.
