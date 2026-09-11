# SQL Server JDBC and operational changes

## Application versus console

For an application-versus-console discrepancy, inspect the relevant SQL text, parameter
types/representative values, database, login, SET options and cache-key evidence. Reuse supplied
captures and redact sensitive values. SSMS can use different SET options and literals, so a fast
console run can be a different optimization problem.

`sendStringParametersAsUnicode=true` can send Java strings as Unicode parameters. Against `VARCHAR`,
type precedence can cause an indexed-side conversion, but collation and optimizer behavior affect
whether a seek remains possible and how much work it performs. Inspect the actual seek/residual
predicates, conversions and representative work. `PlanAffectingConvert` with
`ConvertIssue="Seek Plan"` is a lead; warning presence or absence is not a complete conversion audit.
Do not disable Unicode globally from the type mismatch alone. Check character preservation and
comparison/sort semantics, including genuinely nationalized columns and non-ASCII values.
The property applies to non-national character JDBC types; `setNString`/national character APIs
still send Unicode. Sending non-Unicode strings to nationalized data can lose characters that the
actual code page cannot represent.

Driver preparation/statement pooling and bulk-copy routing change server-visible statements. Confirm
effective properties for the resolved mssql-jdbc version and inspect what reached SQL Server.
For example, the 13.2.0 source defaults to `prepareMethod=prepexec`; whether the first execution
prepares a server handle also depends on `enablePrepareOnFirstPreparedStatementCall`. Java's
`prepareStatement` alone does not establish one server preparation path. This source pin is not an
instruction to change the application's resolved artifact or preparation policy.

## Timeouts and transactions

SQL Server does not provide one general server-side statement timeout equivalent. JDBC query timeout
and socket timeout cover different boundaries; `SET LOCK_TIMEOUT` covers lock waiting only. Fit each
inside the caller deadline and preserve the SQL error that distinguishes timeout from deadlock or
connectivity failure.

For mssql-jdbc, `queryTimeout` and `cancelQueryTimeout` use seconds; `socketTimeout` and
`lockTimeout` use milliseconds. Check their effective defaults and sentinels in the resolved driver.
Cancellation acknowledgement can add `cancelQueryTimeout` after `queryTimeout`; a socket timeout
can close the connection. None alone proves that server work stopped or a write did not commit.
Reserve cancellation/cleanup within the overall deadline, inspect transaction/connection state,
and reconcile an unknown write outcome before retrying it. Roll back an open failed transaction
when possible; discard an unusable connection rather than returning it to the pool as healthy.

Keep remote I/O outside database transactions unless the invariant requires it. A quiet session can
still retain locks or versions while application code waits elsewhere.
Transaction age alone does not prove which lock or version-retention mechanism is active.

## Replicas and DDL

Readable Availability Group replicas change routing, plan/cache context, lag, and row-versioning
costs. Measure primary and secondary effects; `applicationIntent=ReadOnly` is not merely a connection
string cosmetic.

Read-only intent does not by itself establish read-only routing or enforce application write
policy. Verify listener, routing configuration, target database and actual connected replica.
Replica lag can violate read-after-write requirements even when connection establishment succeeds.

Before DDL, verify engine version/edition, requested online/resumable options, expected boundary
locks, log growth, replica redo, disk headroom, cancellation semantics, and rollback. Run the same
edition in rehearsal or explicitly branch the migration.

## Primary references

- [JDBC timeout boundaries](https://learn.microsoft.com/en-us/sql/connect/jdbc/understand-timeouts?view=sql-server-ver17) — units, cancellation acknowledgement and connection closure; match the installed driver.
- [Read-only routing](https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/configure-read-only-routing-for-an-availability-group-sql-server?view=sql-server-ver16) — listener and replica configuration.
- [JDBC connection properties](https://learn.microsoft.com/en-us/sql/connect/jdbc/setting-the-connection-properties?view=sql-server-ver17) — Unicode/national character semantics and preparation settings; match the resolved driver.
- [Collation and Unicode](https://learn.microsoft.com/en-us/sql/relational-databases/collations/collation-and-unicode-support?view=sql-server-ver16) — comparison rules depend on collation and character type.
- [Conversion warning heuristics](https://techcommunity.microsoft.com/blog/sqlserver/when-do-conversions-generate-conversion-warnings-and-why-are-these-bad/384356/) — historical Microsoft explanation (2014), not a current-target plan observation.
- [Prepared statement behavior](https://learn.microsoft.com/en-us/sql/connect/jdbc/prepared-statement-metadata-caching-for-the-jdbc-driver?view=sql-server-ver17) — first execution, server handles and version-dependent settings.
- [mssql-jdbc 13.2.0 driver properties](https://github.com/microsoft/mssql-jdbc/blob/v13.2.0/src/main/java/com/microsoft/sqlserver/jdbc/SQLServerDriver.java) — explicit source pin for property defaults, not deployed configuration evidence.
