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

## Buffer pool and memory

Start from the real process/container limit. Subtract connection/session buffers, temporary tables,
performance schema, log buffers, binary log, code, and OS headroom. With direct I/O, do not count on
the OS page cache to compensate for an undersized pool.

Observe working-set residency, reads, dirty percentage, eviction/flush rates, temporary work, and OOM
headroom under target concurrency. Per-connection buffers make a safe value depend on active work,
not just configured connections.

## Version discipline

MySQL 8.4 changed important InnoDB defaults, including the Linux flush method, adaptive hash,
change buffering and I/O capacity. An old configuration file can preserve old behavior across an upgrade. Query the
effective value and whether it was explicitly persisted; verify renamed/deprecated redo settings
against the exact server build.

[MySQL 8.4 clustered and secondary indexes](https://dev.mysql.com/doc/refman/8.4/en/innodb-index-types.html)
defines the clustered-key fallback and secondary locator.
[MySQL 8.4 changes from 8.0](https://dev.mysql.com/doc/refman/8.4/en/mysql-nutshell.html)
lists default changes and platform conditions; these do not override explicit effective settings.
