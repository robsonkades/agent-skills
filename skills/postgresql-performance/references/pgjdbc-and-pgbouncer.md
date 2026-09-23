# pgjdbc and PgBouncer

## Prepared-plan lifecycle

pgjdbc commonly begins using a named server statement after `prepareThreshold` executions. PostgreSQL
then compares custom and generic planning after its own executions. The combined transition can make a
query change behavior after repeated use; driver connection turnover can reset client history while
backend lifetime and pooler preparation/eviction determine server history. A stable JDBC connection
through transaction pooling is not stable PostgreSQL backend affinity.

For a plan-transition claim, use representative warm-up and parameter distribution while identifying
the driver connection, pool mode and actual server-plan state. Reuse adequate captures; a source-only
explanation does not need a new warm-up run. `prepareThreshold=0` disables named reuse, not by itself
parameterized extended-protocol execution; `preferQueryMode` is a separate choice. It trades away reuse
and possibly binary transfer, so change it only for a supported scoped reason, not every pooler.

## Batching

`reWriteBatchedInserts=true` can combine compatible inserts, subject to parameter/driver size limits.
Confirm the exact property spelling and driver version, server-visible statements, round-trips, update
counts, and error semantics. Above the JDBC/rewrite knee, evaluate `COPY` rather than indefinitely
increasing batch size.

## Result streaming

Positive `setFetchSize`/`defaultRowFetchSize` alone does not prove streaming. The normal documented
cursor setup uses an explicit JDBC transaction (`autocommit=false`), forward-only/nonholdable results
and a single statement through the applicable protocol path. Inspect the exact driver: pgjdbc 42.7.11
also permits its cursor flag when the server transaction is already OPEN despite JDBC autocommit=true.
That exceptional path is not advice to mix SQL and JDBC transaction control casually; holdability,
query mode and transaction ownership still matter. A driver flag is not proof of server fetch behavior.

When a streaming or memory-bound claim needs validation, use a bounded isolated fixture with a modest
heap, consume without retaining all rows, and compare representative row counts/widths and cleanup.
Adequate supplied runtime evidence or a narrow source question does not require repeating that campaign.
Do not provoke application OOM in production to prove streaming. Close result/statement and end
the transaction on success/failure/cancellation; a long streaming cursor can hold xmin and block cleanup.

## PgBouncer pool modes

Transaction pooling may assign a different server connection for the next transaction; repeated
assignment to the same backend does not establish affinity. Inventory session
state: `SET`, LISTEN, temporary tables, session advisory locks, cursors with hold, and prepared
statements. PgBouncer's named-protocol prepared-statement support requires a supporting version and
nonzero `max_prepared_statements`; it does not preserve every SQL-level session feature. Inspect the
specific feature's contract: `ON COMMIT DROP` temporary tables differ from session-lived tables,
and tracked startup parameters differ from arbitrary session `SET`. Preserve an adequate supported
pool mode/configuration rather than rejecting a feature solely by label.

Distinguish Hikari physical connections, PgBouncer client/server pools, and PostgreSQL backends when
sizing and diagnosing. A metric called “connections” without its layer is ambiguous.

## Timeouts

Statement, lock, idle-in-transaction, and transaction timeouts cover different intervals and may have
zero defaults. Fit them with pool/JDBC/socket/caller deadlines and verify the exact SQL state. PostgreSQL
17+ transaction timeout can bound a continuously active long transaction that idle timeout cannot.
Unlike `statement_timeout` and `lock_timeout`, `transaction_timeout` terminates the session: verify
that the driver/pool discards the dead connection and obtains a replacement before any safe retry.
When enabled, it supersedes a statement or idle-in-transaction timeout of equal or longer duration.
Prepared transactions are exempt; resolving their locks/xmin requires the transaction owner's
two-phase-commit recovery policy, not a session timeout.
Caller timeout or JDBC cancellation is not proof execution ended or the connection is reusable;
verify server outcome, rollback/connection state and driver/pool recovery behavior.

Source: [pgjdbc query/cursor prerequisites](https://jdbc.postgresql.org/documentation/query/).
The exceptional transaction-state branch is scoped to
[pgjdbc 42.7.11 PgStatement](https://github.com/pgjdbc/pgjdbc/blob/REL42.7.11/pgjdbc/src/main/java/org/postgresql/jdbc/PgStatement.java).
Also check [driver preparation](https://jdbc.postgresql.org/documentation/server-prepare/),
[PostgreSQL prepared plans](https://www.postgresql.org/docs/18/sql-prepare.html), and
[PgBouncer features](https://www.pgbouncer.org/features.html)/[configuration](https://www.pgbouncer.org/config.html).
Timeout semantics: [PostgreSQL 17 client settings](https://www.postgresql.org/docs/17/runtime-config-client.html)
and [PostgreSQL 18 client settings](https://www.postgresql.org/docs/18/runtime-config-client.html).
