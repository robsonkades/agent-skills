-- Manual two-session probe in the disposable database AFTER Hibernate inserts a row.
-- Replace the numeric ID below with that inserted ID; this is NOT an automatic claim protocol.
-- Session A: leave this transaction open only while coordinating session B.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
SELECT id, status FROM dbo.outbox_event WITH (UPDLOCK, ROWLOCK) WHERE id = 1;
-- Session B, another connection, run separately:
-- SET LOCK_TIMEOUT 1000;
-- BEGIN TRANSACTION;
-- UPDATE dbo.outbox_event SET attempts = attempts + 1 WHERE id = 1;
-- Observe timeout/blocking, then IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
-- Finally run ROLLBACK TRANSACTION in session A.
-- ROWLOCK is not a guarantee against escalation; inspect actual locks and isolation.
-- Compare the SQL emitted by the JPA lock query; these hints are not assumed identical.
