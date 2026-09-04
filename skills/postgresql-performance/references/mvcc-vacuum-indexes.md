# PostgreSQL MVCC, VACUUM, and indexes

## Tuple lifecycle

An update writes a new heap tuple; delete marks a tuple obsolete. VACUUM makes dead space reusable and
advances freeze protection, but it cannot remove versions still visible to the oldest xmin. Check:

- long/open/idle transactions and `backend_xmin`;
- abandoned replication slots and standby feedback;
- prepared transactions;
- VACUUM verbose output such as dead-but-not-yet-removable;
- table-level vacuum/analyze timestamps, counts, dead tuples, XID age, and worker progress.

A successful command with no removals is evidence of a horizon blocker, not healthy cleanup.

## Autovacuum and freeze

Scale-factor triggers grow with table size; large high-churn tables often need relation-specific
absolute thresholds. PostgreSQL 18 adds a global maximum vacuum threshold, so state version before
using it. Tune trigger frequency, worker/cost capacity, and completion time together—more frequent
starts do not help if workers cannot finish.

Never disable autovacuum to avoid load. Approaching anti-wraparound limits eventually forces work and
can stop writes. Monitor oldest unfrozen XID with a large safety margin.

## HOT and fillfactor

HOT requires that index-dependent columns remain unchanged and that the same heap page has room for
the new tuple. Estimate reserved bytes from page/tuple size; a percentage that cannot fit one version
buys nothing. Validate the change using interval deltas of HOT updates versus all updates, plus table
size and read amplification. Lower fillfactor permanently increases pages read.

## Index visibility and specialized structures

PostgreSQL indexes point to heap TIDs. Index-only scans still visit the heap unless the visibility map
says the page is all-visible; inspect `Heap Fetches` and VACUUM state.

Partial indexes require the planner to prove predicate implication. Parameterized custom plans can use
one while a later generic plan cannot, so test after real prepared-statement warm-up.

BRIN summarizes physical ranges. Choose it for huge physically correlated data and broad scans, then
monitor correlation drift. It cannot serve highly selective point lookup like a B-tree.

`VACUUM FULL` rewrites under an exclusive lock; `REINDEX` does not remove heap bloat. For online bloat
repair, select and validate an appropriate rewrite tool/strategy and set desired fillfactor before the
rewrite.
