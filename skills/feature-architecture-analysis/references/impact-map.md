# Building the impact map

## Traversal

For each accepted scope item, find an evidence-backed starting point. Inspect supplied paths,
the repository file/module inventory and the feature's public or stored names. Search those
identities in source, contract definitions, configuration and tests; open the matching definition
and its use before including it. A name match is a candidate, not a dependency. If the behavior is
new, find the registration point or analogous flow that constrains its proposed location; label
the location proposed rather than claiming it exists. If none can be established, record that gap.

Follow the actual entrypoint to its application behavior, state access and observable result.
Check applicable security, transaction, configuration and observability attachments on that path.
Then trace outward using the identity the next consumer actually uses: a Java interface instead
of its implementation name, a topic/configuration binding instead of a payload class, or a table
or view instead of its repository wrapper. Read the registration and consuming handler/query;
count distinct consumers separately from references and tests. For Java `ServiceLoader`, inspect
`META-INF/services` on the class path or `uses`/`provides` in module descriptors as applicable,
then the relevant packaging/runtime configuration. A declaration alone does not prove deployment
or use in the environment being mapped; see the version-specific reference below.

Inspect relevant test assertions as well as their names: do they exercise the consumer's changed
assumption? An empty concern does not end the sweep: a scheduled job with no source callers still
has state, security and tests. Record what was inspected and what remains outside available evidence.

Trace effects in both directions: callers observe changed contracts; dependencies can receive
new values, load, transaction patterns or retries. Include shared-resource contention and
indirect consumers such as scheduled tasks, reflection/DI registrations and remote clients.
Stop a propagation branch when evidence shows the relevant contract/load/state is unchanged,
or record an unresolved boundary. Use visited identities to avoid cycles and repeated counting.

## Bounded coverage

For a multi-branch investigation, keep a compact record alongside the impact entries, updating it
as new consumers are found. Reuse an existing map/document; a small local change can use a sentence.

```text
Scope/impact -> consumer or boundary -> inspected roots, identities and evidence -> disposition
Disposition: mapped (impact IDs), stopped (why no further effect), unresolved (gap + next check/owner)
```

Record material search limits: inaccessible repositories, excluded/generated files, unavailable
effective configuration and failed commands. Check the search root and filters before interpreting
zero matches; a tool error or no eligible files is not a completed search. Inspect relevant ignored
or generated artifacts through their known paths or generators when needed, rather than searching
the whole machine. Keep possible consumers distinct from confirmed ones.

Follow branches where changed values, state, load or failure behavior can propagate; stop those
whose relevant behavior is shown unchanged. Prioritize unresolved boundaries that could change
compatibility or inclusion in the implementation plan. If access or the task's investigation budget
runs out, return the supported map plus those open branches and their next discriminating checks.
Do not turn an unexamined branch into an exclusion or call the map exhaustive. An unrelated cleanup
candidate is outside this feature map unless its dependency on the accepted scope is established.

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
  the dependency is new, heavier or used under different conditions, such as input values,
  ordering, transaction scope or failure handling. Unchanged call counts do not imply unchanged
  effects. For example, splitting two queries from one PostgreSQL Repeatable Read transaction
  into separate transactions can change their snapshot relationship while leaving the DAO code
  untouched. Map that DAO and the consistency question; inspect the actual engine/isolation before
  concluding what changed.

For each entry include the evidence locator, affected party and expected verification; an
external locator can be a topic/schema ID, qualified table, dashboard URL or deployment key.
Distinguish verified consumers from possible consumers and searched repositories from the
whole ecosystem. A zero text-match count is not proof of no users.

Visibility is about observability relative to the named component, not about access modifiers. A private field that is
persisted is EXTERNAL, because the stored rows outlive the deployment.

## Shared contracts and conflicting evidence

When propagation reaches a shared API, event, table or configuration key, use that identity to
find its authoritative specification and the relevant consuming features' contracts/tests. Compare
the changed promise, not whole feature dossiers: defaults, allowed values, state meaning, error
handling or ordering can diverge while the schema remains identical. Qualify feature-local IDs by
their document and revision; two documents' `CT-01` entries need not identify the same contract.

Keep three facts separate: the accepted guarantee, observed implementation/consumer behavior,
and the proposed change. An accepted contract is not a conformance test; an implementation
does not silently supersede its specification. For a consequential mismatch, record both evidence
locators, affected consumers and verification points, then route the unresolved semantics to the
contract/decision owner. Existing usage may need impact analysis even when it relies on undocumented
behavior; that does not automatically make the usage a supported guarantee. Continue independent
branches and do not choose which promise to discard, modify another feature's scope, or demand a
new approval solely because a consumer belongs to another team.

For example, a new worklist feature proposes excluding cancelled orders from the default shared
`GET /orders` response. A reconciliation feature's contract and test require those orders in the
same unfiltered request. Map the default change and the unchanged reconciliation reader as an
affected consumer, with the conflicting revisions and a semantic compatibility question. Passing
response-schema checks cannot establish that reconciliation still sees the required records.
If instead the accepted change adds an explicit filter used only by the worklist, and source/tests
establish that unfiltered behavior is preserved, record that evidence and stop this propagation
branch; do not demand reconciliation changes merely because it uses the endpoint. Trace any other
changed load, security or state effects separately. These are illustrative conditions, not evidence
about the target project or a recommendation to select the filter design.

## Mapping before a mechanism is selected

Do not require a completed design to discover impacts. Separate surfaces established by the
accepted behavior from candidates that depend on an unresolved decision. Link the decision or
unknown and state what would make each candidate applicable; NEW labels alone do not express this.

For example, an accepted asynchronous export may require authorization and retrieval behavior,
but a Kafka topic is conditional if Kafka is only a proposal. Finding an existing broker is evidence
of a capability, not acceptance of that solution. Trace confirmed surfaces now; give the solution
analysis the candidate topic/consumer locators and compatibility questions. If Kafka is already an
accepted decision, include its relevant producer, consumer, configuration and failure-path impacts
in the supported map. Recheck affected branches when that decision changes, without comparing or
selecting implementations here.

## Deployment, activation and retained effects

Use this check when flags, coexistence of versions or durable effects can change who observes an
impact. Inspect the actual gate and effective configuration: a request flag may not guard startup
registration, migrations or background processing. Record environment/cohort differences only when
they affect the map; an unavailable runtime value is an explicit unknown, not evidence of exclusion.

Map the relevant states and transitions: deployed but inactive, active writers/readers, mixed
versions, and disabled or reverted code with retained data. Follow the evidence to old/new readers,
stored representations, queued messages and replay where applicable. Do not enumerate every flag
combination or prescribe a release sequence; identify which compatibility checks or contract
decisions the reachable states require.

For example, a flag gates emission of a new status value. Turning it off may stop new emissions,
but previously written rows and queued events can still reach an old reader after rollback.
Keep those readers and the retained representations in the map until their absence or compatibility
is established. If evidence shows the gate has never been enabled and no other writer produces the
value, that retained-value branch can be excluded for the inspected environment; deployed schema,
registration and configuration effects still need their own evidence. Tests must address the
identified state/contract question, not merely show that each binary starts alone.

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

## Verify the map

Before handing the map to planning, reconcile it in both directions:

- Every accepted scope item has impacts or a supported no-impact conclusion. Every consequential
  impact has a source scope item or an explicit scope question, not an invented requirement.
- When feature changes already exist, compare the relevant diff, migrations and wiring with the
  map. Explain unmatched changes or update missing impacts; preserve unrelated working-tree work
  instead of treating it as feature scope. Without a diff, verify existing anchors and proposed
  locations; do not imply that the proposed implementation has been checked.
- For consequential crossings, reopen the source-to-binding-to-consumer chain and inspect the
  assertion, query or handler on which the impact claim rests. Correct unsupported links and mark
  missing evidence unresolved. A file's existence or a referenced test name does not verify its
  behavior; distinguish inspected coverage from an executed check and name any needed check.
- Each unresolved branch has a next action that could settle it, such as inspecting a deployment
  binding or an unavailable consumer contract, and states which conclusion depends on it. Map
  verification is not a claim that an unimplemented feature works or that a consumer must change.

## Compatibility and release references

- [Java SE 17 ServiceLoader](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/ServiceLoader.html) — callers may use a service without naming its provider; class-path configuration and module declarations supply discovery evidence. Check the target Java version and runtime visibility rather than assuming every declared provider is active.
- [ripgrep guide](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md) — when a search unexpectedly misses a known resource, inspect file filtering and configuration before interpreting the result as absence.
- [Google AIP-180: Backwards compatibility](https://google.aip.dev/180) — when shared API defaults or semantics change, inspect consumer expectations as well as schemas. Its policy targets Google's API conventions and mostly protobuf/JSON; apply the target project's support policy rather than importing Google's versioning rules.
- [JLS 25 binary compatibility](https://docs.oracle.com/javase/specs/jls/se25/html/jls-13.html) — consult the target Java version; binary compatibility does not establish source or behavioral compatibility.
- [Protocol Buffers message evolution](https://protobuf.dev/programming-guides/proto3/#updating) — binary wire-safe changes can still affect application code; JSON and other formats have different rules. Apply the actual protocol/version rather than assuming every additive field is safe.
- [PostgreSQL 18 transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html) — when transaction scope changes, check snapshot and visibility rules even for unchanged queries; verify the target engine/version.
- [Pete Hodgson: Feature Toggles](https://martinfowler.com/articles/feature-toggles.html) — deployment and activation can be separate; inspect relevant runtime/cohort configuration and test consequential flag states.
- [AWS Builders' Library: Ensuring rollback safety during deployments](https://d1.awsstatic.com/builderslibrary/pdfs/ensuring-rollback-safety-during-deployments.pdf) — independently working versions do not establish transition safety; old/new readers and retained representations determine rollback compatibility.
