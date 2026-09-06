# SQL Server JDBC and operational changes

## Application versus console

Capture the SQL text, parameter types/values, database, login, SET options, and plan cache key from the
application. SSMS commonly uses different SET options and literals, so a fast console run can be a
different optimization problem.

`sendStringParametersAsUnicode=true` can send Java strings as Unicode parameters. Against `VARCHAR`,
type precedence can force conversion of the indexed column. Verify `PlanAffectingConvert` with
`ConvertIssue="Seek Plan"`; changing the setting requires auditing genuinely nationalized columns.

Driver preparation/statement pooling and bulk-copy routing change server-visible statements. Confirm
effective properties for the resolved mssql-jdbc version and inspect what reached SQL Server.

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
