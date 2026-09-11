# Connector/J and online DDL

## Prepared statements and batching

Server preparation and caching are separate. Enabling server prepare without a useful cache can add
round-trips; defaults for cache count and SQL-length limits may be too small for ORM statements.
Driver batch rewrite is another mechanism again. Stable batch sizes limit statement-shape churn;
confirm prepared-statement counts and server-observed statements.

Treat copied connection properties as suspect. Some accepted legacy names are no-ops or removed;
older SSL flags map to `sslMode`. Verify the exact Connector/J reference and effective connection
behavior, including certificate/hostname verification.

## Fetch and timeouts

A Java fetch-size call does not by itself prove streaming or bounded memory. A version-matched
API/source check can answer a configuration question. For a runtime memory or fetch-path claim,
use adequate observations or a bounded isolated rehearsal with known result shape, client/server
memory, protocol behavior and cleanup. Do not require exceeding eager-materialization capacity;
state the tested size and limits instead.

Connector/J 8.4.0 provides a concrete reference: forward-only/read-only row streaming uses
`Integer.MIN_VALUE` fetch size; cursor fetching requires `useCursorFetch=true`, a positive fetch
size and a forward-only result. That driver's property initialization enables `useServerPrepStmts`
when cursor fetching is enabled. Verify the resolved version, effective properties, eligible
server-prepared execution and server cursor status rather than inferring a cursor from a fetch-size call.
Cursor mode can move materialization pressure to the server; it does not promise a streaming
execution plan or bounded server memory.

For row streaming, consume or close the result before another query on that connection. Closing
an unread stream may drain remaining rows and block; cancellation/close and connection reuse need
their own verification when that lifecycle changes. Keep resource ownership explicit: close or
release owned resources on success, failure and early exit, and complete or roll back at the
intended transaction boundary. Streaming can prolong locks, read views and pool occupancy.
Inspect the actual transaction/autocommit contract, without
copying another driver's autocommit requirements. Query execution, socket read, connection
acquisition and InnoDB lock wait are separate timeouts; fit them into one caller deadline without
treating one as coverage for all.

## DDL safety

Specify `ALGORITHM` and `LOCK` where supported so an unsupported online expectation fails instead of
silently becoming a table copy. Check operation-specific/version-specific INSTANT budget and whether
old row versions have exhausted it.

MySQL 8.4 INSTANT permits only LOCK=DEFAULT (or omission), not LOCK=NONE. INPLACE does not mean
no table rebuild or no metadata locking. Distinguish InnoDB row-lock wait timeout from metadata
`lock_wait_timeout`, which applies separately to each metadata-lock acquisition, not total DDL
duration. Use an overall deployment/caller budget and verify cancellation and cleanup. MySQL DDL can
implicitly commit: atomic DDL crash recovery does not provide user-transaction ROLLBACK of a
successful schema change. Plan reversal or forward repair explicitly.

Before execution, find relevant transaction/metadata-lock blockers; even an instant change can
wait a long time at its metadata boundary. For the chosen operation, budget temporary disk,
redo/binlog, replica apply and reversal or cleanup as applicable. Validate affected algorithm/lock
claims with adequate evidence or a proportionate rehearsal; a source-only review does not prove
runtime eligibility or completion time.

Sources: [Connector/J implementation notes](https://dev.mysql.com/doc/connectors/en/connector-j-reference-implementation-notes.html),
[Connector/J cursor properties](https://dev.mysql.com/doc/connector-j/en/connector-j-connp-props-performance-extensions.html),
and [Connector/J 8.4.0 source](https://github.com/mysql/mysql-connector-j/tree/8.4.0/src/main) —
`JdbcPropertySetImpl`, `StatementImpl` and `ResultsetRowsStreaming` define the reference behavior;
the unversioned guide does not establish behavior of every deployed driver.
For DDL use the [MySQL 8.4 operation matrix](https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-operations.html),
[ALTER TABLE concurrency clauses](https://dev.mysql.com/doc/refman/8.4/en/alter-table.html),
[algorithm/lock concurrency rules](https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-performance.html),
and [metadata-lock timeout](https://dev.mysql.com/doc/refman/8.4/en/server-system-variables.html#sysvar_lock_wait_timeout).
For cursor materialization and eligibility, see [MySQL 8.4 server-side cursors](https://dev.mysql.com/doc/refman/8.4/en/cursor-restrictions.html).
