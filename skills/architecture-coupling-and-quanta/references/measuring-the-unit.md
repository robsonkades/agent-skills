# Measuring the unit

Use these measurements to investigate edges, not to manufacture a quantum count.
Record environment, window, input revision/query, exclusions, artifact-to-target mapping
and missing coverage. Save raw counts alongside ratios. A clean result from incomplete
telemetry is not evidence of independence.
For any ratio, a zero denominator means no eligible observations: report it as undefined,
not as 0% coupling or evidence of independence.

## 1. Co-change: locate candidate change obligations

Map files to deployment targets using build/package ownership before aggregating.
Within each revision, count a target at most once even if many of its files changed.
Keep unmapped files visible. Across repositories, commit hashes are not shared change IDs;
use verified PR/feature links or report that cross-repository support is unknown.

For A and B, let nA and nB be their eligible revision counts and s their shared count:

- Directional observed co-change: s/nA and s/nB. Neither proves the other change was required.
- Code Maat's coupling degree uses s divided by the **average** of nA and nB, times 100,
  with implementation-specific output rounding. It is not a directional probability and
  does not use the larger count as denominator.
- Example: nA=20, nB=10, s=10 gives directional rates 50% and 100%, and a symmetric degree
  of about 66.7% before rounding. These different statistics must not share one label.

To reproduce a history analysis:

1. Select an explicit start/end window, branch and merge policy; export commit IDs and changed
   paths (for example with Git history tooling). Document renames, squash merges and shallow
   clone limitations. Avoid copying author data or commit messages when paths/IDs suffice.
2. Apply the reviewed path-to-target mapping. Separate generated, mechanical and broad-format
   changes; retain counts of exclusions so legitimate cross-target migrations are not hidden.
3. Compute the counts above. Inspect linked diffs/PRs for the highest-impact pairs and low-volume
   pairs implicated by an incident; low support means uncertainty, not permission to discard them.
4. Record the mechanism, or leave “required co-change” as a hypothesis. Validate by inspecting
   compatible version combinations or a representative independent change.

Code Maat is optional. If used, pin the actual binary/source revision, choose its documented
Git parser and export format together, supply and inspect its layer mapping, and compare a
small known pair against the counts above before interpreting estate output. Its README lists
filters such as minimum revisions/shared revisions and maximum changeset size; configure and
record them explicitly. Do not substitute CodeScene defaults or assume an unconfigured
file-level command measures deployables. No install is required by this skill.

Source: [Code Maat implementation](https://raw.githubusercontent.com/adamtornhill/code-maat/master/src/code_maat/analysis/logical_coupling.clj)
and [usage](https://github.com/adamtornhill/code-maat), checked 2026-09-05. The master URL moves;
verify the formula/options against the version actually run. No Code Maat execution was
performed for this skill revision.

## 2. Co-deployment versus required coordination

Collect target, artifact digest/version, environment, timestamp, change reference and
deployment outcome. Deduplicate retries of the same deployment; distinguish rollbacks and
no-op redeployments. Choose whether the unit of analysis is a rollout event or a change
episode and use that unit consistently.

One useful exploratory statistic is:

    A episodes associated with a B rollout / eligible A episodes

State how episodes are linked and the window used. Check deployments before as well as
after A; a provider-first migration would be missed by looking only for a subsequent B.
Compute the reverse ratio separately. “8 of 10” is an observation, not an 80% proof that
independent deployment is impossible.

A shared release train, bundled feature or monorepo automation can produce high ratios.
Even the same change reference does not distinguish policy from technical necessity.
Inspect artifact changes and ask what would fail if only A changed:

- Can old/new provider and consumer versions coexist under the contract?
- Can A roll back while B stays on its current version, including persisted data?
- Is coordination a mandatory sequence with an overlap window, or an atomic lockstep release?
- Was coordination chosen for convenience, or demonstrated necessary by a failure/test?

A compatible independent deployment refutes a universal “always lockstep” claim but does
not prove every future change independent. A rare destructive migration can matter even
when the historical ratio is low. Preserve the scope of each conclusion.

Record binding launch/approval policies and their owners separately from technical constraints.
A mandatory coordinated launch can limit independent delivery even when mixed versions work;
it need not require simultaneous binary deployment if dark deployment is permitted. Establish
which action the policy governs. A compatible rollout test does not waive that obligation, and
a habitual release train is not automatically a mandatory policy.

[DORA's loosely coupled teams capability](https://dora.dev/capabilities/loosely-coupled-teams/)
supports asking about independent deployment and testing; it supplies no quantum-count
algorithm or threshold for these ratios.

### Compatibility evidence for the actual release

This mapping skill has no Java execution baseline or executable Java example. For Java
artifacts, inspect Maven/Gradle release/toolchain settings, resolved dependency versions,
packaged artifacts, CI and production runtime images before claiming compatible deployment.
Do not upgrade Java, libraries or build tools to make an independence claim hold.

Separate three checks: recompiling consumer source, linking an already-built consumer with a
replacement JAR, and preserving behavior under the operation contract. Passing one does not
establish the others. A same-process JAR replacement exposes Java linkage constraints; two
processes using different JAR versions instead need compatible wire formats and semantics,
not identical Java classes. Check each artifact's runtime requirements independently. A build
on a newer JDK is not proof that its packaged dependencies run on the older production JVM.
Missing resolved-version or runtime evidence makes that edge unknown, not compatible.

For retained events, compatibility is also temporal: record which writer versions remain in
the log, backlog or dead-letter store, and which reader versions can run after rollback.
Validate those combinations with representative payloads and business invariants. A new
reader accepting old events does not prove an old reader accepts new events after rollback;
compatibility with the immediately previous schema does not necessarily cover retained history.
An unsafe combination is evidence for a rollout/replay constraint, not automatically an
atomic release group. Hand off remediation design once that constraint is established.

Sources checked 2026-09-05: [JLS 17 binary compatibility](https://docs.oracle.com/javase/specs/jls/se17/html/jls-13.html)
distinguishes binary linkage from source compatibility;
[javac 17](https://docs.oracle.com/en/java/javase/17/docs/specs/man/javac.html) documents release targeting.
These are reference editions, not a required project upgrade. Match the target Java edition.
[Confluent compatibility modes](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html)
distinguishes reader/writer direction and transitive history checks; verify the actual registry,
schema format and effective mode. Schema acceptance alone does not validate business semantics.

## 3. Shared data: identify objects and access, not just connections

Start with resolved configuration and deployment metadata, then correlate runtime identity.
Use instance/cluster identity, database, schema and object where available. Database names
repeat across hosts, and an endpoint may be an alias or pooler. Do not print credentials.

- PostgreSQL `pg_stat_activity` exposes sessions including database, user, client and
  `application_name`. It is a snapshot, not a history of table ownership or writes.
  Application names are client supplied and may be missing or misleading. Correlate service
  roles, deployment identity and connection pooling; visibility depends on privileges.
- SQL Server `sys.dm_exec_sessions.program_name` is a similar session attribution hint,
  not proof that a named program wrote a particular table.
- Database client spans can connect service identity to database operations. Check actual
  instrumentation/schema versions and sampling coverage. Current OTel conventions use
  `db.system.name` and `db.namespace`; legacy instrumentation can still emit `db.system`
  and `db.name`. Normalize known versions deliberately rather than declaring old data invalid.
  Include server/instance identity; namespaces alone need not be globally unique.

Then inspect migrations, grants, queries and representative audit/query records to distinguish
reads, writes, DDL ownership, stored procedures, triggers and shared transactions. Grants
show permitted access, not observed access; sampled statements show observations, not all
possible access. Do not enable broad production query/payload capture just to fill a map.

Examples: two services on one host with isolated schemas share an infrastructure risk;
two writers maintaining one table's invariant have a data coordination obligation; a reader
can still break on a column rename. State each mechanism rather than equating every session
with a shared-schema writer.

For an atomicity claim, name the invariant and trace the actual connection/transaction context,
enlisted resources and any coordinator. One database can serve independent transactions, and
different schemas within it can participate in one transaction. Inspect the isolation/locking
needed for the invariant; grouping writes in a transaction alone does not prove that concurrent
executions preserve it. Mark unknown enlistment as unknown even if a framework annotation or
diagram says “transactional.”

Merging processes does not turn multiple transactional resources into one local transaction.
Distinguish an atomic commit boundary from several local commits with retries or compensation.
For the latter, map what can remain committed when a later action fails and who must recover it;
an error response does not undo prior effects. Keep a working local transaction where it meets
the requirement, and hand off any transaction redesign after establishing the constraint.

Sources checked 2026-09-05:
[PostgreSQL monitoring](https://www.postgresql.org/docs/current/monitoring-stats.html),
[SQL Server sessions](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-exec-sessions-transact-sql?view=sql-server-ver17),
[OTel database spans](https://opentelemetry.io/docs/specs/semconv/db/database-spans/),
[OTel migration guide](https://opentelemetry.io/docs/specs/semconv/non-normative/db-migration/).
Match privileges and fields to the deployed versions.

Transaction distinctions checked 2026-09-10 against
[PostgreSQL 18 transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html),
[schemas](https://www.postgresql.org/docs/18/ddl-schemas.html) and
[Spring's local versus global transaction model](https://docs.spring.io/spring-framework/reference/data-access/transaction/motivation.html)
(7.0.9 documentation). These support the boundary distinction, not proof of a project's enlistment
or concurrent invariants; inspect its actual database, transaction manager and recovery behavior.

## 4. Runtime dependence and validation

For the named operation, trace what it must wait for, then test dependency absence/delay
in an isolated environment. Check accepted versus completed work, valid degraded output,
freshness, backlog limits and recovery. A happy-path trace shows an invocation, not its
necessity; an error response after timeout is not proof of independence.

### Preserve the completion condition

Annotate required groups as **all-of**, **any-of** or **k-of-n**, with the operation and
eligible participants. Keep replica detail below the logical service when that is the chosen
map granularity; three replicas do not automatically mean three application release units.
An alternative dependency is not absent merely because one peer can be removed successfully.

For example, a quote may require `Inventory AND (Pricing-A OR Pricing-B)`. Under that stated
contract, losing Inventory alone or losing both pricing providers prevents completion;
losing just Pricing-A need not. Replacing OR with AND overstates the dependency, while removing
both pricing edges after separate successful outage tests understates it. This expression is
an illustrative success condition, not executable code or a quantum-count formula.

Check that the alternatives actually satisfy the same outcome and can be selected within the
deadline. Failover capacity, data freshness, credentials and a shared discovery/database failure
can make an apparent OR ineffective. “Healthy process” is not equivalent to a valid result.
For quorum groups, record membership, required acknowledgments and the operation's consistency
contract; enough live processes alone does not establish connectivity, leadership or progress.
An optional call may still cause resource contention, so record shared-capacity exposure even
when its response is not required for the business outcome.

Validate the discriminating failure combinations in isolation: one alternative absent, all
eligible alternatives absent, and the relevant quorum-loss case. Record the combinations
actually covered; do not require exhaustive outage testing or infer an estate availability
number from a Boolean diagram. Common failures and capacity limits need their own evidence.

### Qualify the operating phase and horizon

Record whether each finding covers steady-state serving, cold start, scaling or recovery.
A running service may use cached routes while a replacement must reach discovery to start.
Credential expiry, cache freshness or backlog capacity can also end a temporary tolerance
window. Test a representative restart/recovery path during the dependency outage, and the
limiting expiry/exhaustion condition where applicable. A successful five-minute warm test
supports only that population, phase and horizon; it does not prove independent recovery.
Keep startup prerequisites on the structural view even if warm request traces omit them.

Sources checked 2026-09-19: [etcd v3.6 FAQ](https://etcd.io/docs/v3.6/faq/#what-is-failure-tolerance)
documents majority requirements for cluster progress; apply the actual operation/membership
contract rather than transferring one quorum rule to every read or datastore.
[AWS's static-stability account](https://aws.amazon.com/builders-library/static-stability-using-availability-zones/)
distinguishes running data-plane behavior from control-plane needs when launching replacements.
The completion notation and proposed fault cases above are analytical conventions, not a
measured availability model or a claim about a system whose behavior has not been inspected.

Historical metrics usually suit periodic review. Runtime monitors, pre-deployment checks and
CI contract tests can each enforce a defined property; there is no universal “never a gate”
rule. Choose freshness, failure policy and ownership with `architecture-fitness-functions`.
Automate graph/count computation only after defining edge semantics; an algorithm cannot
supply missing evidence or establish functional cohesion.
