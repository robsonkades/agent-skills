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

A Java fetch-size call does not by itself prove streaming or bounded memory. In an isolated,
resource-bounded rehearsal, progressively increase result size beyond what eager materialization
could hold; inspect client/server memory, wire behavior and cleanup rather than exhausting production.
Connector/J distinguishes forward-only/read-only row streaming selected by `Integer.MIN_VALUE`
fetch size from cursor fetching selected by `useCursorFetch=true` and a positive fetch size.
Cursor mode uses server-side preparation and can move materialization pressure to the server.
For row streaming, consume or close the result before issuing another query on that connection.
Verify cancellation and close behavior, transaction lifetime and the actual driver version; do not
copy another database driver's autocommit requirements. Query execution, socket read, connection acquisition, and InnoDB lock wait are separate
timeouts; fit them into one caller deadline without treating one as coverage for all.

## DDL safety

Specify `ALGORITHM` and `LOCK` where supported so an unsupported online expectation fails instead of
silently becoming a table copy. Check operation-specific/version-specific INSTANT budget and whether
old row versions have exhausted it.

MySQL 8.4 INSTANT permits only LOCK=DEFAULT (or omission), not LOCK=NONE. INPLACE does not mean
no table rebuild or no metadata locking. Distinguish InnoDB row-lock wait timeout from metadata
`lock_wait_timeout`; a very long default is not an acceptable deployment deadline. MySQL DDL can
implicitly commit: atomic DDL crash recovery does not provide user-transaction ROLLBACK of a
successful schema change. Plan reversal or forward repair explicitly.

Before execution, find long transactions and metadata-lock blockers; an instant metadata change can
wait indefinitely at its boundary. Budget temporary disk, redo/binlog, replica apply, and rollback or
cleanup. Observe the real algorithm and locks in rehearsal with concurrent traffic.

Sources: [Connector/J implementation notes](https://dev.mysql.com/doc/connectors/en/connector-j-reference-implementation-notes.html),
[MySQL 8.4 online DDL](https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl.html).
