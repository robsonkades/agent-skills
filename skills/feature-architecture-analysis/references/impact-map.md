# Building the impact map

## Traversal

For each accepted scope item, check each applicable concern below. An empty concern does not
end the sweep: a scheduled job with no source callers still has state, security and tests.
Record what was inspected, what was absent there, and what remains outside available evidence.

1. **The element that changes.** The class, the file, the migration, the config key.
2. **Its callers.** Search for them; do not recall them. Record the count.
3. **Its state.** What it reads and writes — fields, tables, caches, files.
4. **Its contract.** Anything anyone outside the component has coded against.
5. **Its configuration.** New keys, changed defaults, environment differences.
6. **Its cross-cutting attachments.** Security rules, transactions, metrics, logs, traces.
7. **Its tests.** Which existing tests cover it, and what they assert.

Trace effects in both directions: callers observe changed contracts; dependencies can receive
new values, load, transaction patterns or retries. Include shared-resource contention and
indirect consumers such as scheduled tasks, reflection/DI registrations and remote clients.
Stop a propagation branch when evidence shows the relevant contract/load/state is unchanged,
or record an unresolved boundary. Use visited identities to avoid cycles and repeated counting.

## Entry shape

```text
IMP-01  <path>[:line]   NEW | MODIFIED | READ   INTERNAL | EXTERNAL   <change> <- SC-01
```

- **NEW** — did not exist; the proposed location must be labeled. Additions can affect
  routing, exhaustive consumers, permissions, defaults or serialization, so compatibility
  still needs investigation.
- **MODIFIED** — an existing element changes, including removal or retirement. State the operation
  explicitly; retain the prior path/identity and revision for removed elements, and both locators for
  moves/renames. Trace remaining callers, configuration, retained data and rollback compatibility;
  deleting a file does not remove the impact on its consumers.
- **READ** — does not change, but the feature depends on its current behaviour. Include it when
  the dependency is new or heavier than before; that is how a change breaks a file nobody edited.

For each entry include the evidence locator, affected party and expected verification; an
external locator can be a topic/schema ID, qualified table, dashboard URL or deployment key.
Distinguish verified consumers from possible consumers and searched repositories from the
whole ecosystem. A zero text-match count is not proof of no users.

Visibility is about observability relative to the named component, not about access modifiers. A private field that is
persisted is EXTERNAL, because the stored rows outlive the deployment.

## The layers to sweep

A map that only lists application code can miss important effects. Use the applicable concerns below
against the actual architecture; the table does not require these layers or empty output sections.
Distinguish no impact found in the inspected scope, not applicable, and not examined/unavailable.

| Layer         | Look for                                                        |
| ------------- | --------------------------------------------------------------- |
| API           | Endpoints, request and response types, validation, status codes |
| Application   | Services, orchestration, transaction boundaries                 |
| Domain        | Entities, value objects, invariants, domain events              |
| Persistence   | Repositories, queries, mappings, indexes                        |
| Schema        | Migrations, columns, constraints, existing rows                 |
| Messaging     | Producers, consumers, topics, payload schemas, ordering         |
| Integration   | Outbound clients, timeouts, retries, contracts                  |
| Configuration | Keys, defaults, per-environment values, secrets                 |
| Security      | Authentication, authorisation rules, data exposure              |
| Observability | Metrics, logs, traces, alerts that reference the changed thing  |
| Tests         | Existing tests that must change; levels that must gain a test   |
| Delivery      | Build, packaging, deployment order, feature flags               |

## Boundary crossings

A crossing is an affected contract, ownership or runtime boundary. Record parties and known
review/rollout obligations separately; do not assume every crossing requires agreement or
coordinated deployment. Reuse existing authorization and record unresolved ownership without
claiming approval or contacting people automatically. Independent illustrative crossings:

```text
Crossing   IMP-07 Order created event gains a field
Depends    two consumers (billing, notifications)
Needs      inspect old/new producer-consumer combinations, missing-field behavior, validation,
           intermediaries and replay; unknown-field tolerance alone does not prove independent rollout
Evidence   consumer configuration plus compatibility/behavior tests, or explicit unknowns

Crossing   IMP-11 orders.status gains a value
Depends    inspect the reporting view and its downstream consumers
Needs      a whitelist/CASE/join may omit or misclassify the value; GROUP BY alone normally
           creates a new group. Record the actual query and expected totals before requiring a change
```

The second entry is the shape that costs a weekend: a change that is compatible at the code
level and wrong at the data level.

## Sizing conclusions the map supports

The map is the input to three later decisions, and it should be read for each:

- **Depth** — locality can reduce coordination work, but security, invariants, concurrency,
  reversibility and resource exposure determine review depth alongside it.
- **Test level** — EXTERNAL entries need verification where their effects are observed; cite existing
  coverage or identify the missing check rather than assuming every entry requires a new test.
- **Risk** — every boundary crossing is a candidate risk entry, with the consumer as its
  detection point.

## What the map is not

Not a design, not an order of work, and not a task list. It answers one question — what does
this touch — and it answers it with paths so that the answer can be checked against the diff at
the end.

## Compatibility references

- [JLS 25 binary compatibility](https://docs.oracle.com/javase/specs/jls/se25/html/jls-13.html) — consult the target Java version; binary compatibility does not establish source or behavioral compatibility.
- [Protocol Buffers message evolution](https://protobuf.dev/programming-guides/proto3/#updating) — binary wire-safe changes can still affect application code; JSON and other formats have different rules. Apply the actual protocol/version rather than assuming every additive field is safe.
