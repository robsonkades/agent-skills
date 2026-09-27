# InnoDB storage, redo, and configuration

## Clustered physical model

Rows live in clustered-index leaves. Ordinary secondary B-tree entries carry clustered-key columns;
key-width times rows times index count is only a first-order estimate, not an exact disk-size delta.
Account for overlapping index columns, record overhead, occupancy, compression and off-page data.
Separate width from insertion order: wide keys enlarge every tree; random order spreads write working
set and can increase splits. Without a declared PK, InnoDB first uses the first UNIQUE index whose
columns are all NOT NULL; only without either does it create an internal row-id clustered index.

## Write path

- Redo makes page changes recoverable and is flushed according to durability policy.
- Undo supports MVCC/rollback; old read views delay purge and lengthen history.
- Binlog supports replication/PITR and has its own sync policy.
- Doublewrite protects against torn page writes.

Commit durability is a joint statement about redo and binlog configuration. State which process,
OS, host, or storage failures may lose transactions before relaxing either.

Size redo capacity from peak bytes generated per unit time, checkpoint pressure, acceptable burst
duration, and crash recovery. Larger redo buys time/variance, not sustained device throughput.

### Choose the write-path lever from its evidence

For MySQL 8.4, sample relevant `SHOW GLOBAL STATUS` values over the same workload interval and
record server identity, uptime and elapsed time. Difference cumulative counters for rates; current
gauges and LSN positions need their own interpretation. Discard a delta crossing a restart/reset,
and do not reset shared counters merely to simplify measurement. Verify variable availability on
the target distribution; a missing value is not zero.

| Observation                                                   | Discriminating evidence and candidate action                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Innodb_log_waits` increases                                  | In-memory log-buffer space forced a wait for flush. Check transaction size, `innodb_log_buffer_size` and flush behavior; a larger log buffer is a candidate for large transactions. Splitting transactions is an alternative only if atomicity permits. This counter alone does not justify larger redo capacity.       |
| Checkpoint age grows and checkpoint flushing cannot keep pace | Compute `Innodb_redo_log_current_lsn - Innodb_redo_log_checkpoint_lsn` from closely aligned observations. Compare its trajectory with redo generation, page flushing and effective capacity. Extra redo space may absorb a bounded burst; sustained insufficient drain still needs less write work or adequate storage. |
| Commit latency rises while checkpoint pressure stays low      | Correlate redo/binlog synchronization waits, device latency and group-commit/workload shape. Review `innodb_flush_log_at_trx_commit` and `sync_binlog` as durability contracts; larger redo files or buffers do not remove a required commit synchronization.                                                           |

`Innodb_redo_log_capacity_resized` reports completed effective capacity; inspect
`Innodb_redo_log_resize_status` when it differs from requested configuration. Configured bytes are
not a universal usable checkpoint-age limit: leave internal progress margin and validate observed
pressure. `Innodb_redo_log_logical_size` covers the LSN range still needed by redo consumers and is
not always interchangeable with current-minus-checkpoint. Keep units and the measured population
explicit; transaction payload bytes are not an exact measure of redo generated.

After a candidate change, compare the implicated wait/rate or age trajectory at equivalent useful
work, plus commit tails, storage latency, memory and the unchanged durability contract. A reduced
wait counter with lower throughput is not sufficient evidence of improvement.

## Buffer pool and memory

Start from the real process/container limit. Subtract connection/session buffers, temporary tables,
performance schema, log buffers, binary log, code, and OS headroom. With direct I/O, do not count on
the OS page cache to compensate for an undersized pool.

Observe working-set residency, reads, dirty percentage, eviction/flush rates, temporary work, and OOM
headroom under target concurrency. Per-connection buffers make a safe value depend on active work,
not just configured connections.

Use interval changes in `Innodb_buffer_pool_read_requests` and `Innodb_buffer_pool_reads` with
physical-read rate/latency; a long-lived aggregate hit ratio can hide the affected interval.
`Innodb_buffer_pool_wait_free` counts waits for dirty pages to be flushed when a clean page is
needed. If it rises despite a high hit ratio, inspect dirty-page/flush progress, device saturation
and checkpoint pressure rather than concluding the pool is healthy or applying an automatic RAM
increase. Choose memory for demonstrated residency pressure and flushing/storage changes for the
observed write bottleneck, within their resource budgets.

## Version discipline

MySQL 8.4 changed important InnoDB defaults, including the Linux flush method, adaptive hash,
change buffering and I/O capacity. An old configuration file can preserve old behavior across an upgrade. Query the
effective value and whether it was explicitly persisted; verify renamed/deprecated redo settings
against the exact server build.

[MySQL 8.4 clustered and secondary indexes](https://dev.mysql.com/doc/refman/8.4/en/innodb-index-types.html)
defines the clustered-key fallback and secondary locator.
[MySQL 8.4 changes from 8.0](https://dev.mysql.com/doc/refman/8.4/en/mysql-nutshell.html)
lists default changes and platform conditions; these do not override explicit effective settings.
[MySQL 8.4 status variables](https://dev.mysql.com/doc/refman/8.4/en/server-status-variables.html)
defines the log-buffer/clean-page wait counters and redo LSN/capacity fields.
[Redo log management](https://dev.mysql.com/doc/refman/8.4/en/innodb-redo-log.html)
and [redo tuning](https://dev.mysql.com/doc/refman/8.4/en/optimizing-innodb-logging.html)
distinguish capacity from log-buffer sizing and recovery costs.
[Buffer pool flushing](https://dev.mysql.com/doc/refman/8.4/en/innodb-buffer-pool-flushing.html)
describes dirty-page/LRU and adaptive checkpoint flushing; settings require workload evidence.
