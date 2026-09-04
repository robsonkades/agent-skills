# pgjdbc and PgBouncer

## Prepared-plan lifecycle

pgjdbc commonly begins using a named server statement after `prepareThreshold` executions. PostgreSQL
then compares custom and generic planning after its own executions. The combined transition can make a
query change behavior only after repeated use on one physical connection and reset after deploy/pool
turnover.

Capture the plan after representative warm-up on the same connection and with the same parameter
distribution. `prepareThreshold=0` disables named reuse, not parameterized extended-protocol behavior;
it trades away reuse and possibly binary transfer, so use it only as a measured scoped intervention.

## Batching

`reWriteBatchedInserts=true` can combine compatible inserts, subject to parameter/driver size limits.
Confirm the exact property spelling and driver version, server-visible statements, round-trips, update
counts, and error semantics. Above the JDBC/rewrite knee, evaluate `COPY` rather than indefinitely
increasing batch size.

## Result streaming

`setFetchSize`/`defaultRowFetchSize` creates a server cursor only under required statement type,
autocommit/transaction, and single-statement conditions. Prove bounded memory with a result larger
than heap and inspect transaction duration: a long streaming cursor can hold xmin and block cleanup.

## PgBouncer pool modes

Transaction pooling returns a different server connection after a transaction. Inventory session
state: `SET`, LISTEN, temporary tables, session advisory locks, cursors with hold, and prepared
statements. PgBouncer's named-protocol prepared-statement support is version/configuration specific and
does not preserve every SQL-level session feature.

Distinguish Hikari physical connections, PgBouncer client/server pools, and PostgreSQL backends when
sizing and diagnosing. A metric called “connections” without its layer is ambiguous.

## Timeouts

Statement, lock, idle-in-transaction, and transaction timeouts cover different intervals and may have
zero defaults. Fit them with pool/JDBC/socket/caller deadlines and verify the exact SQL state. PostgreSQL
17+ transaction timeout can bound a continuously active long transaction that idle timeout cannot.
